//! 系统托盘模块
//! 管理系统托盘图标和菜单

#[cfg(not(target_os = "macos"))]
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};

#[cfg(target_os = "macos")]
use tauri::image::Image;
#[cfg(not(target_os = "macos"))]
use tauri::menu::{IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    Emitter, Runtime,
};
use tracing::info;

#[cfg(target_os = "macos")]
use crate::modules::config::TrayIconStyle;
use crate::modules::logger;

/// 托盘菜单 ID
pub const TRAY_ID: &str = "main-tray";

#[cfg(target_os = "macos")]
const MACOS_STATUS_ITEM_AUTOSAVE_NAME: &str = "com.jlcodes.cockpit-tools.main-tray";

#[cfg(target_os = "macos")]
static MACOS_TRAY_SKIP_LOGGED: AtomicBool = AtomicBool::new(false);

/// How long a rebuild request waits for its neighbours before the menu is built.
///
/// Long enough to swallow a quota sweep's fan-out, short enough that a tray the
/// user opens right after switching accounts already shows the new state.
const TRAY_MENU_COALESCE_WINDOW: std::time::Duration = std::time::Duration::from_millis(150);

/// Rebuild requests received since the pending rebuild last took a batch.
static TRAY_MENU_REQUESTS: AtomicUsize = AtomicUsize::new(0);
/// Whether a worker is already committed to serving the outstanding requests.
static TRAY_MENU_REBUILD_SCHEDULED: AtomicBool = AtomicBool::new(false);
/// Newest tray snapshot waiting to be applied on the UI thread.
/// Older queued applies compare against this and drop themselves.
#[cfg(not(target_os = "macos"))]
static TRAY_MENU_APPLY_GENERATION: AtomicUsize = AtomicUsize::new(0);

/// 单层最多直出的平台数量（超出进入“更多平台”子菜单）
#[cfg(any(test, not(target_os = "macos")))]
const TRAY_PLATFORM_MAX_VISIBLE: usize = 6;

#[cfg(any(test, not(target_os = "macos")))]
fn next_tray_menu_apply_generation(slot: &AtomicUsize) -> usize {
    slot.fetch_add(1, Ordering::AcqRel).wrapping_add(1)
}

#[cfg(any(test, not(target_os = "macos")))]
fn is_stale_tray_menu_apply(slot: &AtomicUsize, generation: usize) -> bool {
    slot.load(Ordering::Acquire) != generation
}

#[cfg(any(test, not(target_os = "macos")))]
fn split_tray_menu_visible_overflow<T>(
    mut entries: Vec<T>,
    max_visible: usize,
) -> (Vec<T>, Vec<T>) {
    let split_index = entries.len().min(max_visible);
    let overflow = entries.split_off(split_index);
    (entries, overflow)
}

#[cfg(target_os = "macos")]
const MACOS_TRAY_TEMPLATE_ICON_SIZE: u32 = 36;

#[cfg(target_os = "macos")]
const MACOS_TRAY_TEMPLATE_FALLBACK_RGB: u8 = 225;

#[cfg(target_os = "macos")]
fn build_macos_template_tray_icon() -> Result<Image<'static>, tauri::Error> {
    let source = Image::from_bytes(include_bytes!("../../icons/tray/status-template.png"))?;
    let source_width = source.width();
    let source_height = source.height();
    let source_rgba = source.rgba();
    let target_size = MACOS_TRAY_TEMPLATE_ICON_SIZE;
    let mut target_rgba = Vec::with_capacity((target_size * target_size * 4) as usize);

    for target_y in 0..target_size {
        let src_y_start = target_y * source_height / target_size;
        let src_y_end = ((target_y + 1) * source_height / target_size)
            .max(src_y_start + 1)
            .min(source_height);

        for target_x in 0..target_size {
            let src_x_start = target_x * source_width / target_size;
            let src_x_end = ((target_x + 1) * source_width / target_size)
                .max(src_x_start + 1)
                .min(source_width);

            let mut alpha_sum: u32 = 0;
            let mut sample_count: u32 = 0;
            for src_y in src_y_start..src_y_end {
                for src_x in src_x_start..src_x_end {
                    let index = ((src_y * source_width + src_x) * 4 + 3) as usize;
                    alpha_sum += source_rgba[index] as u32;
                    sample_count += 1;
                }
            }

            let alpha = if sample_count == 0 {
                0
            } else {
                (alpha_sum / sample_count) as u8
            };
            target_rgba.extend_from_slice(&[
                MACOS_TRAY_TEMPLATE_FALLBACK_RGB,
                MACOS_TRAY_TEMPLATE_FALLBACK_RGB,
                MACOS_TRAY_TEMPLATE_FALLBACK_RGB,
                alpha,
            ]);
        }
    }

    Ok(Image::new_owned(target_rgba, target_size, target_size))
}

#[cfg(target_os = "macos")]
fn macos_tray_icon_for_style<'a, R: Runtime>(
    app: &'a tauri::AppHandle<R>,
    style: TrayIconStyle,
) -> Result<(Image<'a>, bool), tauri::Error> {
    match style {
        TrayIconStyle::Template => Ok((build_macos_template_tray_icon()?, true)),
        TrayIconStyle::Color => Ok((
            app.default_window_icon()
                .expect("default window icon should exist")
                .clone(),
            false,
        )),
    }
}

#[cfg(target_os = "macos")]
fn configure_macos_status_item_identity<R: Runtime>(tray: &TrayIcon<R>) {
    let result = tray.with_inner_tray_icon(|tray_icon| {
        let Some(status_item) = tray_icon.ns_status_item() else {
            return "status_item=none".to_string();
        };

        let autosave_name = objc2_foundation::NSString::from_str(MACOS_STATUS_ITEM_AUTOSAVE_NAME);
        status_item.setAutosaveName(Some(&autosave_name));
        status_item.setVisible(true);
        status_item.setLength(objc2_app_kit::NSVariableStatusItemLength);

        let current_autosave_name = status_item.autosaveName().to_string();
        format!(
            "autosave_name={}, visible={}, length={}",
            current_autosave_name,
            status_item.isVisible(),
            status_item.length()
        )
    });

    match result {
        Ok(detail) => logger::log_info(&format!("[Tray] macOS 状态栏项目身份已设置: {}", detail)),
        Err(err) => logger::log_warn(&format!("[Tray] macOS 状态栏项目身份设置失败: {}", err)),
    }
}

#[cfg(target_os = "macos")]
pub fn apply_tray_icon_style<R: Runtime>(app: &tauri::AppHandle<R>) -> Result<(), String> {
    let style = crate::modules::config::get_user_config().tray_icon_style;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let (icon, icon_as_template) =
            macos_tray_icon_for_style(app, style).map_err(|err| err.to_string())?;
        let icon_width = icon.width();
        let icon_height = icon.height();
        tray.set_icon(Some(icon)).map_err(|err| err.to_string())?;
        tray.set_icon_as_template(icon_as_template)
            .map_err(|err| err.to_string())?;
        let rect_log = match tray.rect() {
            Ok(Some(rect)) => format!("rect={:?}", rect),
            Ok(None) => "rect=none".to_string(),
            Err(err) => format!("rect_error={}", err),
        };
        logger::log_info(&format!(
            "[Tray] macOS 菜单栏图标样式已应用: style={}, icon={}x{}, template={}, {}",
            style.as_str(),
            icon_width,
            icon_height,
            icon_as_template,
            rect_log
        ));
    }
    Ok(())
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(crate) enum PlatformId {
    Antigravity,
    Codex,
}

impl PlatformId {
    pub(crate) fn default_order() -> [Self; 2] {
        [
            Self::Codex,
            Self::Antigravity,
        ]
    }

    pub(crate) fn from_str(value: &str) -> Option<Self> {
        match value {
            crate::modules::tray_layout::PLATFORM_ANTIGRAVITY => Some(Self::Antigravity),
            crate::modules::tray_layout::PLATFORM_CODEX => Some(Self::Codex),
            _ => None,
        }
    }

    pub(crate) fn as_str(self) -> &'static str {
        match self {
            Self::Antigravity => crate::modules::tray_layout::PLATFORM_ANTIGRAVITY,
            Self::Codex => crate::modules::tray_layout::PLATFORM_CODEX,
        }
    }

    pub(crate) fn title(self) -> &'static str {
        match self {
            Self::Antigravity => "Antigravity IDE",
            Self::Codex => "Codex",
        }
    }

    pub(crate) fn nav_target(self) -> &'static str {
        match self {
            Self::Antigravity => "overview",
            Self::Codex => "codex",
        }
    }
}

/// 菜单项 ID
pub mod menu_ids {
    pub const SHOW_WINDOW: &str = "show_window";
    pub const SHOW_FLOATING_CARD: &str = "show_floating_card";
    pub const REFRESH_QUOTA: &str = "refresh_quota";
    pub const SETTINGS: &str = "settings";
    pub const QUIT: &str = "quit";
}

/// 账号显示信息
#[cfg(any(test, not(target_os = "macos")))]
struct AccountDisplayInfo {
    account: String,
    quota_lines: Vec<String>,
}

#[derive(Debug, Clone)]
#[cfg(any(test, not(target_os = "macos")))]
enum TrayMenuEntry {
    Platform(PlatformId),
    Group {
        id: String,
        name: String,
        platforms: Vec<PlatformId>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(any(test, not(target_os = "macos")))]
struct TrayMenuSnapshotPlatform {
    submenu_id: String,
    title: String,
    platform_id: String,
    account: String,
    quota_lines: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(any(test, not(target_os = "macos")))]
enum TrayMenuSnapshotEntry {
    Platform(TrayMenuSnapshotPlatform),
    Group {
        submenu_id: String,
        name: String,
        platforms: Vec<TrayMenuSnapshotPlatform>,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
#[cfg(any(test, not(target_os = "macos")))]
struct TrayMenuSnapshot {
    lang: String,
    show_window: String,
    show_floating_card: String,
    refresh_quota: String,
    settings: String,
    quit: String,
    more_platforms: String,
    no_platform_selected: String,
    visible_entries: Vec<TrayMenuSnapshotEntry>,
    overflow_entries: Vec<TrayMenuSnapshotEntry>,
}

#[derive(Debug, Clone, Copy)]
#[cfg(not(target_os = "macos"))]
struct CopilotMetric {
    used_percent: Option<i32>,
    included: bool,
}

#[derive(Debug, Clone, Copy)]
#[cfg(not(target_os = "macos"))]
struct CopilotUsage {
    inline: CopilotMetric,
    chat: CopilotMetric,
    premium: CopilotMetric,
    reset_ts: Option<i64>,
}

/// 创建系统托盘（完整菜单，包含账号数据加载）
/// 创建骨架托盘（无账号文件 I/O，仅基础菜单项，用于快速启动）
pub fn create_tray_skeleton<R: Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<TrayIcon<R>, tauri::Error> {
    info!("[Tray] 创建骨架托盘...");

    #[cfg(target_os = "linux")]
    {
        *APPLIED_TRAY_MENU_SNAPSHOT
            .lock()
            .unwrap_or_else(|error| error.into_inner()) = None;
    }

    #[cfg(not(target_os = "macos"))]
    let lang = crate::modules::config::get_user_config().language;

    #[cfg(not(target_os = "macos"))]
    let show_window = MenuItem::with_id(
        app,
        menu_ids::SHOW_WINDOW,
        get_text("show_window", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let refresh_quota = MenuItem::with_id(
        app,
        menu_ids::REFRESH_QUOTA,
        get_text("refresh_quota", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let show_floating_card = MenuItem::with_id(
        app,
        menu_ids::SHOW_FLOATING_CARD,
        get_text("show_floating_card", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let settings = MenuItem::with_id(
        app,
        menu_ids::SETTINGS,
        get_text("settings", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let quit = MenuItem::with_id(
        app,
        menu_ids::QUIT,
        get_text("quit", &lang),
        true,
        None::<&str>,
    )?;
    #[cfg(not(target_os = "macos"))]
    let loading = MenuItem::with_id(
        app,
        "tray_loading",
        get_text("loading", &lang),
        false,
        None::<&str>,
    )?;

    #[cfg(not(target_os = "macos"))]
    let menu = {
        let menu = Menu::new(app)?;
        menu.append(&show_window)?;
        menu.append(&show_floating_card)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&loading)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&refresh_quota)?;
        menu.append(&settings)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&quit)?;
        menu
    };

    #[cfg(target_os = "macos")]
    let (tray_icon, tray_icon_as_template) = macos_tray_icon_for_style(
        app,
        crate::modules::config::get_user_config().tray_icon_style,
    )?;
    #[cfg(target_os = "macos")]
    let tray_icon_log = format!(
        "icon={}x{}, template={}",
        tray_icon.width(),
        tray_icon.height(),
        tray_icon_as_template
    );
    #[cfg(not(target_os = "macos"))]
    let tray_icon = app.default_window_icon().unwrap().clone();

    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .show_menu_on_left_click(false)
        .tooltip("Cockpit Tools")
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_event);

    #[cfg(target_os = "macos")]
    let builder = builder.icon_as_template(tray_icon_as_template);

    #[cfg(not(target_os = "macos"))]
    let builder = builder.menu(&menu);

    let tray = builder.build(app)?;

    #[cfg(target_os = "macos")]
    let _ = tray.set_show_menu_on_left_click(false);
    #[cfg(target_os = "macos")]
    let _ = tray.set_icon_as_template(tray_icon_as_template);
    #[cfg(target_os = "macos")]
    configure_macos_status_item_identity(&tray);

    #[cfg(target_os = "macos")]
    {
        let rect_log = match tray.rect() {
            Ok(Some(rect)) => format!("rect={:?}", rect),
            Ok(None) => "rect=none".to_string(),
            Err(err) => format!("rect_error={}", err),
        };
        logger::log_info(&format!(
            "[Tray] macOS 骨架托盘状态: {}, {}",
            tray_icon_log, rect_log
        ));
    }

    info!("[Tray] 骨架托盘创建完成，等待后台加载完整菜单");
    Ok(tray)
}

/// Collect tray labels and current-account quota text without touching native menus.
#[cfg(not(target_os = "macos"))]
fn collect_tray_menu_snapshot() -> TrayMenuSnapshot {
    let config = crate::modules::config::get_user_config();
    let lang = config.language.clone();
    let ordered_entries = resolve_tray_entries();
    let snapshot_entries: Vec<TrayMenuSnapshotEntry> = ordered_entries
        .iter()
        .map(|entry| snapshot_tray_entry(entry, &lang))
        .collect();
    let (visible_entries, overflow_entries) =
        split_tray_menu_visible_overflow(snapshot_entries, TRAY_PLATFORM_MAX_VISIBLE);

    TrayMenuSnapshot {
        show_window: get_text("show_window", &lang),
        show_floating_card: get_text("show_floating_card", &lang),
        refresh_quota: get_text("refresh_quota", &lang),
        settings: get_text("settings", &lang),
        quit: get_text("quit", &lang),
        more_platforms: get_text("more_platforms", &lang),
        no_platform_selected: get_text("no_platform_selected", &lang),
        lang,
        visible_entries,
        overflow_entries,
    }
}

#[cfg(not(target_os = "macos"))]
fn snapshot_tray_entry(entry: &TrayMenuEntry, lang: &str) -> TrayMenuSnapshotEntry {
    map_tray_entry_to_snapshot(entry, |platform| get_account_display_info(platform, lang))
}

#[cfg(any(test, not(target_os = "macos")))]
fn map_tray_entry_to_snapshot<F>(entry: &TrayMenuEntry, mut lookup: F) -> TrayMenuSnapshotEntry
where
    F: FnMut(PlatformId) -> AccountDisplayInfo,
{
    match entry {
        TrayMenuEntry::Platform(platform) => TrayMenuSnapshotEntry::Platform(snapshot_platform(
            *platform,
            format!("platform:{}:submenu", platform.as_str()),
            platform.title().to_string(),
            lookup(*platform),
        )),
        TrayMenuEntry::Group {
            id,
            name,
            platforms,
        } => {
            if let [platform] = platforms.as_slice() {
                return TrayMenuSnapshotEntry::Platform(snapshot_platform(
                    *platform,
                    format!("group:{}:submenu", id),
                    name.clone(),
                    lookup(*platform),
                ));
            }

            TrayMenuSnapshotEntry::Group {
                submenu_id: format!("group:{}:submenu", id),
                name: name.clone(),
                platforms: platforms
                    .iter()
                    .map(|platform| {
                        snapshot_platform(
                            *platform,
                            format!("platform:{}:submenu", platform.as_str()),
                            platform.title().to_string(),
                            lookup(*platform),
                        )
                    })
                    .collect(),
            }
        }
    }
}

#[cfg(any(test, not(target_os = "macos")))]
fn snapshot_platform(
    platform: PlatformId,
    submenu_id: String,
    title: String,
    info: AccountDisplayInfo,
) -> TrayMenuSnapshotPlatform {
    TrayMenuSnapshotPlatform {
        submenu_id,
        title,
        platform_id: platform.as_str().to_string(),
        account: info.account,
        quota_lines: info.quota_lines,
    }
}

/// 构建托盘菜单
#[cfg(not(target_os = "macos"))]
fn build_tray_menu_from_snapshot<R: Runtime>(
    app: &tauri::AppHandle<R>,
    snapshot: &TrayMenuSnapshot,
) -> Result<Menu<R>, tauri::Error> {
    let show_window = MenuItem::with_id(
        app,
        menu_ids::SHOW_WINDOW,
        &snapshot.show_window,
        true,
        None::<&str>,
    )?;
    let refresh_quota = MenuItem::with_id(
        app,
        menu_ids::REFRESH_QUOTA,
        &snapshot.refresh_quota,
        true,
        None::<&str>,
    )?;
    let show_floating_card = MenuItem::with_id(
        app,
        menu_ids::SHOW_FLOATING_CARD,
        &snapshot.show_floating_card,
        true,
        None::<&str>,
    )?;
    let settings = MenuItem::with_id(
        app,
        menu_ids::SETTINGS,
        &snapshot.settings,
        true,
        None::<&str>,
    )?;
    let quit = MenuItem::with_id(app, menu_ids::QUIT, &snapshot.quit, true, None::<&str>)?;

    let mut visible_submenus: Vec<Submenu<R>> = Vec::new();
    for entry in &snapshot.visible_entries {
        visible_submenus.push(build_tray_entry_submenu_from_snapshot(app, entry)?);
    }

    let mut overflow_submenus: Vec<Submenu<R>> = Vec::new();
    for entry in &snapshot.overflow_entries {
        overflow_submenus.push(build_tray_entry_submenu_from_snapshot(app, entry)?);
    }

    let overflow_refs: Vec<&dyn IsMenuItem<R>> = overflow_submenus
        .iter()
        .map(|submenu| submenu as &dyn IsMenuItem<R>)
        .collect();
    let more_platforms_submenu = if overflow_refs.is_empty() {
        None
    } else {
        Some(Submenu::with_id_and_items(
            app,
            "tray_more_platforms",
            &snapshot.more_platforms,
            true,
            &overflow_refs,
        )?)
    };

    let no_platform_item = if visible_submenus.is_empty() && overflow_submenus.is_empty() {
        Some(MenuItem::with_id(
            app,
            "tray_no_platform_selected",
            &snapshot.no_platform_selected,
            true,
            None::<&str>,
        )?)
    } else {
        None
    };

    let menu = Menu::with_id(app, "tray_menu")?;
    menu.append(&show_window)?;
    menu.append(&show_floating_card)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;

    if let Some(item) = &no_platform_item {
        menu.append(item)?;
    } else {
        for submenu in &visible_submenus {
            menu.append(submenu)?;
        }
        if let Some(submenu) = &more_platforms_submenu {
            menu.append(submenu)?;
        }
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&refresh_quota)?;
    menu.append(&settings)?;
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&quit)?;
    Ok(menu)
}

#[cfg(not(target_os = "macos"))]
fn build_tray_entry_submenu_from_snapshot<R: Runtime>(
    app: &tauri::AppHandle<R>,
    entry: &TrayMenuSnapshotEntry,
) -> Result<Submenu<R>, tauri::Error> {
    match entry {
        TrayMenuSnapshotEntry::Platform(platform) => {
            build_platform_details_submenu_from_snapshot(app, platform)
        }
        TrayMenuSnapshotEntry::Group {
            submenu_id,
            name,
            platforms,
        } => {
            let mut submenus: Vec<Submenu<R>> = Vec::new();
            for platform in platforms {
                submenus.push(build_platform_details_submenu_from_snapshot(app, platform)?);
            }
            let refs: Vec<&dyn IsMenuItem<R>> = submenus
                .iter()
                .map(|submenu| submenu as &dyn IsMenuItem<R>)
                .collect();
            Submenu::with_id_and_items(app, submenu_id, name, true, &refs)
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn build_platform_details_submenu_from_snapshot<R: Runtime>(
    app: &tauri::AppHandle<R>,
    platform: &TrayMenuSnapshotPlatform,
) -> Result<Submenu<R>, tauri::Error> {
    let mut items: Vec<MenuItem<R>> = Vec::new();
    items.push(MenuItem::with_id(
        app,
        format!("platform:{}:account", platform.platform_id),
        &platform.account,
        true,
        None::<&str>,
    )?);
    for (idx, line) in platform.quota_lines.iter().enumerate() {
        items.push(MenuItem::with_id(
            app,
            format!("platform:{}:quota:{}", platform.platform_id, idx),
            line,
            true,
            None::<&str>,
        )?);
    }
    let refs: Vec<&dyn IsMenuItem<R>> = items
        .iter()
        .map(|item| item as &dyn IsMenuItem<R>)
        .collect();
    Submenu::with_id_and_items(app, &platform.submenu_id, &platform.title, true, &refs)
}

#[cfg(not(target_os = "macos"))]
fn resolve_tray_entries() -> Vec<TrayMenuEntry> {
    let layout = crate::modules::tray_layout::load_tray_layout();
    let visible = sanitize_platform_list(&layout.tray_platform_ids);
    let visible_set: HashSet<PlatformId> = visible.iter().copied().collect();

    if visible_set.is_empty() {
        return Vec::new();
    }

    let mut groups_by_id: HashMap<String, crate::modules::tray_layout::TrayLayoutGroup> =
        HashMap::new();
    for group in layout.platform_groups {
        groups_by_id.insert(group.id.clone(), group);
    }

    let mut entries = Vec::new();
    let mut used_platforms: HashSet<PlatformId> = HashSet::new();

    for raw_entry in &layout.ordered_entry_ids {
        if let Some(platform) = parse_platform_entry_id(raw_entry) {
            if !visible_set.contains(&platform) || !used_platforms.insert(platform) {
                continue;
            }
            entries.push(TrayMenuEntry::Platform(platform));
            continue;
        }

        let Some(group_id) = parse_group_entry_id(raw_entry) else {
            continue;
        };
        let Some(group) = groups_by_id.get(&group_id) else {
            continue;
        };

        let mut group_platforms: Vec<PlatformId> = Vec::new();
        for raw_platform in &group.platform_ids {
            let Some(platform) = PlatformId::from_str(raw_platform.trim()) else {
                continue;
            };
            if !visible_set.contains(&platform) || !used_platforms.insert(platform) {
                continue;
            }
            group_platforms.push(platform);
        }

        if group_platforms.is_empty() {
            continue;
        }

        let group_name = if group.name.trim().is_empty() {
            group.id.clone()
        } else {
            group.name.clone()
        };

        entries.push(TrayMenuEntry::Group {
            id: group.id.clone(),
            name: group_name,
            platforms: group_platforms,
        });
    }

    for platform in normalize_platform_order(&layout.ordered_platform_ids) {
        if !visible_set.contains(&platform) || !used_platforms.insert(platform) {
            continue;
        }
        entries.push(TrayMenuEntry::Platform(platform));
    }

    entries
}

#[cfg(not(target_os = "macos"))]
fn sanitize_platform_list(ids: &[String]) -> Vec<PlatformId> {
    let mut result = Vec::new();
    let mut seen = HashSet::new();

    for raw in ids {
        let Some(platform) = PlatformId::from_str(raw.trim()) else {
            continue;
        };
        if seen.insert(platform) {
            result.push(platform);
        }
    }

    result
}

#[cfg(not(target_os = "macos"))]
fn normalize_platform_order(ids: &[String]) -> Vec<PlatformId> {
    let mut result = sanitize_platform_list(ids);
    let mut seen: HashSet<PlatformId> = result.iter().copied().collect();

    for platform in PlatformId::default_order() {
        if seen.insert(platform) {
            result.push(platform);
        }
    }

    result
}

#[cfg(not(target_os = "macos"))]
fn parse_platform_entry_id(raw: &str) -> Option<PlatformId> {
    let value = raw.strip_prefix("platform:")?;
    PlatformId::from_str(value.trim())
}

#[cfg(not(target_os = "macos"))]
fn parse_group_entry_id(raw: &str) -> Option<String> {
    let value = raw.strip_prefix("group:")?.trim();
    if value.is_empty() {
        return None;
    }
    Some(value.to_string())
}

#[cfg(not(target_os = "macos"))]
fn format_percent_text(percentage: i32) -> String {
    format!("{}%", percentage.clamp(0, 100))
}

#[cfg(not(target_os = "macos"))]
fn format_quota_line(
    lang: &str,
    label: &str,
    value_text: &str,
    reset_text: Option<&str>,
) -> String {
    let normalized_reset = reset_text
        .map(|text| text.trim())
        .filter(|text| !text.is_empty() && *text != "—");

    if let Some(reset) = normalized_reset {
        format!(
            "{}: {} · {} {}",
            label,
            value_text,
            get_text("reset", lang),
            reset
        )
    } else {
        format!("{}: {}", label, value_text)
    }
}

#[cfg(not(target_os = "macos"))]
fn get_account_display_info(platform: PlatformId, lang: &str) -> AccountDisplayInfo {
    match platform {
        PlatformId::Antigravity => build_antigravity_display_info(lang),
        PlatformId::Codex => build_codex_display_info(lang),
    }
}

#[cfg(not(target_os = "macos"))]
fn build_antigravity_display_info(lang: &str) -> AccountDisplayInfo {
    match crate::modules::account::get_current_account() {
        Ok(Some(account)) => {
            let quota_lines = if let Some(quota) = &account.quota {
                let grouped_lines = build_antigravity_group_quota_lines(lang, &quota.models);
                if grouped_lines.is_empty() {
                    build_model_quota_lines(lang, &quota.models)
                } else {
                    grouped_lines
                }
            } else {
                vec![get_text("loading", lang)]
            };
            AccountDisplayInfo {
                account: format!("📧 {}", account.email),
                quota_lines,
            }
        }
        _ => AccountDisplayInfo {
            account: format!("📧 {}", get_text("not_logged_in", lang)),
            quota_lines: vec!["—".to_string()],
        },
    }
}

#[cfg(not(target_os = "macos"))]
fn normalize_antigravity_model_for_match(value: &str) -> String {
    let normalized = value.trim().to_lowercase();
    if normalized.starts_with("gemini-4-argon")
        || matches!(
            normalized.as_str(),
            "argon:weekly" | "gemini-argon-wtu-weekly"
        )
    {
        return "gemini-4-argon".into();
    }
    if normalized.starts_with("gemini-3.8-flash") {
        return "gemini-3.8-flash".into();
    }
    if normalized.starts_with("claude-sonnet-5-5") {
        return "claude-sonnet-5-5".into();
    }
    if normalized.starts_with("claude-opus-5-5") {
        return "claude-opus-5-5".into();
    }
    if normalized.is_empty() {
        return normalized;
    }
    if normalized.starts_with("gemini-3.1-flash")
        || normalized.starts_with("gemini-2.5-flash")
        || normalized.starts_with("gemini-3-flash")
    {
        return "gemini-3-flash".to_string();
    }
    if normalized.starts_with("gemini-3.1-pro-high") || normalized.starts_with("gemini-3-pro-high")
    {
        return "gemini-3.1-pro-high".to_string();
    }
    if normalized.starts_with("gemini-3.1-pro-low") || normalized.starts_with("gemini-3-pro-low") {
        return "gemini-3.1-pro-low".to_string();
    }
    if normalized.starts_with("claude-sonnet-4-6") || normalized.starts_with("claude-sonnet-4-5") {
        return "claude-sonnet-4-6".to_string();
    }
    if normalized.starts_with("claude-opus-4-6-thinking")
        || normalized.starts_with("claude-opus-4-5-thinking")
    {
        return "claude-opus-4-6-thinking".to_string();
    }
    match normalized.as_str() {
        "gemini-3-pro-high" => "gemini-3.1-pro-high".to_string(),
        "gemini-3-pro-low" => "gemini-3.1-pro-low".to_string(),
        "claude-sonnet-4-5" => "claude-sonnet-4-6".to_string(),
        "claude-sonnet-4-5-thinking" => "claude-sonnet-4-6".to_string(),
        "claude-opus-4-5-thinking" => "claude-opus-4-6-thinking".to_string(),
        _ => normalized,
    }
}

#[cfg(not(target_os = "macos"))]
fn antigravity_model_matches(model_name: &str, target: &str) -> bool {
    let left = normalize_antigravity_model_for_match(model_name);
    let right = normalize_antigravity_model_for_match(target);
    if left.is_empty() || right.is_empty() {
        return false;
    }
    left == right || left.starts_with(&(right.clone() + "-")) || right.starts_with(&(left + "-"))
}

#[cfg(not(target_os = "macos"))]
fn parse_model_reset_ts(reset_time: &str) -> Option<i64> {
    chrono::DateTime::parse_from_rfc3339(reset_time)
        .ok()
        .map(|value| value.timestamp())
}

#[cfg(not(target_os = "macos"))]
fn build_antigravity_group_quota_lines(
    lang: &str,
    models: &[crate::models::quota::ModelQuota],
) -> Vec<String> {
    let settings = crate::modules::group_settings::load_group_settings();
    let ordered_groups = settings.get_ordered_groups(Some(3));
    if ordered_groups.is_empty() {
        return Vec::new();
    }

    let mut lines = Vec::new();
    for group_id in ordered_groups {
        let group_models = settings.get_models_in_group(&group_id);
        if group_models.is_empty() {
            continue;
        }

        let mut total_percentage: i64 = 0;
        let mut count: i64 = 0;
        let mut earliest_reset_ts: Option<i64> = None;

        for model in models {
            let belongs = group_models
                .iter()
                .any(|group_model| antigravity_model_matches(&model.name, group_model));
            if !belongs {
                continue;
            }

            total_percentage += i64::from(model.percentage.clamp(0, 100));
            count += 1;
            if let Some(reset_ts) = parse_model_reset_ts(&model.reset_time) {
                earliest_reset_ts = Some(match earliest_reset_ts {
                    Some(current) => current.min(reset_ts),
                    None => reset_ts,
                });
            }
        }

        if count <= 0 {
            continue;
        }

        let avg_percentage = (total_percentage as f64 / count as f64).round() as i32;
        let reset_text = earliest_reset_ts.map(|ts| format_reset_time_from_ts(lang, Some(ts)));
        lines.push(format_quota_line(
            lang,
            &settings.get_group_name(&group_id),
            &format_percent_text(avg_percentage),
            reset_text.as_deref(),
        ));
    }

    lines
}

#[cfg(not(target_os = "macos"))]
fn format_codex_window_label(window_minutes: Option<i64>, fallback: &str) -> String {
    const HOUR_MINUTES: i64 = 60;
    const DAY_MINUTES: i64 = 24 * HOUR_MINUTES;
    const WEEK_MINUTES: i64 = 7 * DAY_MINUTES;

    let Some(minutes) = window_minutes.filter(|value| *value > 0) else {
        return fallback.to_string();
    };

    if minutes >= WEEK_MINUTES - 1 {
        let weeks = (minutes + WEEK_MINUTES - 1) / WEEK_MINUTES;
        return if weeks <= 1 {
            "Weekly".to_string()
        } else {
            format!("{} Week", weeks)
        };
    }

    if minutes >= DAY_MINUTES - 1 {
        let days = (minutes + DAY_MINUTES - 1) / DAY_MINUTES;
        return format!("{}d", days);
    }

    if minutes >= HOUR_MINUTES {
        let hours = (minutes + HOUR_MINUTES - 1) / HOUR_MINUTES;
        return format!("{}h", hours);
    }

    format!("{}m", minutes)
}

#[cfg(not(target_os = "macos"))]
fn build_codex_display_info(lang: &str) -> AccountDisplayInfo {
    if let Some(account) = crate::modules::codex_account::get_current_account() {
        let mut quota_lines = if let Some(quota) = &account.quota {
            let has_presence =
                quota.hourly_window_present.is_some() || quota.weekly_window_present.is_some();
            let mut lines = Vec::new();

            if !has_presence || quota.hourly_window_present.unwrap_or(false) {
                lines.push(format_quota_line(
                    lang,
                    &format_codex_window_label(quota.hourly_window_minutes, "5h"),
                    &format_percent_text(quota.hourly_percentage),
                    Some(&format_reset_time_from_ts(lang, quota.hourly_reset_time)),
                ));
            }

            if !has_presence || quota.weekly_window_present.unwrap_or(false) {
                lines.push(format_quota_line(
                    lang,
                    &format_codex_window_label(quota.weekly_window_minutes, "Weekly"),
                    &format_percent_text(quota.weekly_percentage),
                    Some(&format_reset_time_from_ts(lang, quota.weekly_reset_time)),
                ));
            }

            if lines.is_empty() {
                lines.push(format_quota_line(
                    lang,
                    &format_codex_window_label(quota.hourly_window_minutes, "5h"),
                    &format_percent_text(quota.hourly_percentage),
                    Some(&format_reset_time_from_ts(lang, quota.hourly_reset_time)),
                ));
            }

            lines
        } else {
            vec![get_text("loading", lang)]
        };

        if quota_lines.is_empty() {
            quota_lines.push("—".to_string());
        }

        AccountDisplayInfo {
            account: format!(
                "📧 {}",
                account.display_name(&crate::modules::i18n::translate(
                    lang,
                    "common.apiKeyAccount",
                    &[]
                )),
            ),
            quota_lines,
        }
    } else {
        AccountDisplayInfo {
            account: format!("📧 {}", get_text("not_logged_in", lang)),
            quota_lines: vec!["—".to_string()],
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn build_model_quota_lines(lang: &str, models: &[crate::models::quota::ModelQuota]) -> Vec<String> {
    let mut lines = Vec::new();
    for model in models.iter().take(4) {
        let reset_text = format_reset_time(lang, &model.reset_time);
        lines.push(format_quota_line(
            lang,
            &model.name,
            &format_percent_text(model.percentage),
            Some(&reset_text),
        ));
    }
    if lines.is_empty() {
        lines.push("—".to_string());
    }
    lines
}

#[cfg(not(target_os = "macos"))]
fn format_reset_time_from_ts(lang: &str, reset_ts: Option<i64>) -> String {
    let Some(reset_ts) = reset_ts else {
        return "—".to_string();
    };
    let now = chrono::Utc::now().timestamp();
    let remaining_secs = reset_ts - now;
    if remaining_secs <= 0 {
        return get_text("reset_done", lang);
    }
    format_remaining_duration(remaining_secs)
}

#[cfg(not(target_os = "macos"))]
fn format_remaining_duration(remaining_secs: i64) -> String {
    let mut secs = remaining_secs.max(0);
    let days = secs / 86_400;
    secs %= 86_400;
    let hours = secs / 3_600;
    secs %= 3_600;
    let minutes = (secs / 60).max(1);

    if days > 0 {
        format!("{}d {}h {}m", days, hours, minutes)
    } else if hours > 0 {
        format!("{}h {}m", hours, minutes)
    } else {
        format!("{}m", minutes)
    }
}

/// 格式化重置时间
#[cfg(not(target_os = "macos"))]
fn format_reset_time(lang: &str, reset_time: &str) -> String {
    if let Ok(reset) = chrono::DateTime::parse_from_rfc3339(reset_time) {
        let now = chrono::Utc::now();
        let duration = reset.signed_duration_since(now);

        if duration.num_seconds() <= 0 {
            return get_text("reset_done", lang);
        }

        let hours = duration.num_hours();
        let minutes = duration.num_minutes() % 60;

        if hours > 0 {
            format!("{}h {}m", hours, minutes)
        } else {
            format!("{}m", minutes)
        }
    } else {
        reset_time.to_string()
    }
}

/// 处理菜单事件
fn handle_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: tauri::menu::MenuEvent) {
    let id = event.id().as_ref();
    logger::log_info(&format!("[Tray] 菜单点击: {}", id));

    match id {
        menu_ids::SHOW_WINDOW => {
            if let Err(err) = crate::modules::floating_card_window::show_main_window(app) {
                logger::log_warn(&format!("[Tray] 显示主窗口失败: {}", err));
            }
        }
        menu_ids::REFRESH_QUOTA => {
            let _ = app.emit("tray:refresh_quota", ());
        }
        menu_ids::SHOW_FLOATING_CARD => {
            let _ = crate::modules::floating_card_window::show_floating_card_window(app, true);
        }
        menu_ids::SETTINGS => {
            if let Err(err) =
                crate::modules::floating_card_window::show_main_window_and_navigate(app, "settings")
            {
                logger::log_warn(&format!("[Tray] 打开设置页失败: {}", err));
            }
        }
        menu_ids::QUIT => {
            info!("[Tray] 用户选择退出应用");
            crate::modules::floating_card_window::request_app_exit();
            app.exit(0);
        }
        _ => {
            if let Some(platform) = parse_platform_from_menu_id(id) {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window_and_navigate(
                        app,
                        platform.nav_target(),
                    )
                {
                    logger::log_warn(&format!(
                        "[Tray] 打开平台页面失败: platform={}, err={}",
                        platform.as_str(),
                        err
                    ));
                }
            } else if id.starts_with("ag_") {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window_and_navigate(
                        app, "overview",
                    )
                {
                    logger::log_warn(&format!("[Tray] 打开 Antigravity IDE 总览失败: {}", err));
                }
            } else if id.starts_with("codex_") {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window_and_navigate(
                        app, "codex",
                    )
                {
                    logger::log_warn(&format!("[Tray] 打开 Codex 页面失败: {}", err));
                }
            }
        }
    }
}

fn parse_platform_from_menu_id(id: &str) -> Option<PlatformId> {
    let mut parts = id.split(':');
    if parts.next()? != "platform" {
        return None;
    }
    PlatformId::from_str(parts.next()?)
}

/// 处理托盘图标事件
fn handle_tray_event<R: Runtime>(tray: &TrayIcon<R>, event: TrayIconEvent) {
    match event {
        TrayIconEvent::Click {
            button,
            button_state,
            rect: _rect,
            ..
        } => {
            #[cfg(target_os = "macos")]
            {
                if button == MouseButton::Left {
                    if let Err(err) =
                        crate::modules::floating_card_window::show_main_window(tray.app_handle())
                    {
                        logger::log_warn(&format!("[Tray] 左键恢复主窗口失败: {}", err));
                    }
                    return;
                }

                if button == MouseButton::Right && button_state == MouseButtonState::Down {
                    let app = tray.app_handle().clone();
                    let app_for_menu = app.clone();
                    let _ = app.run_on_main_thread(move || {
                        crate::modules::macos_native_menu::toggle_tray_menu(&app_for_menu, _rect);
                    });
                }
            }

            #[cfg(not(target_os = "macos"))]
            if button == MouseButton::Left && button_state == MouseButtonState::Up {
                if let Err(err) =
                    crate::modules::floating_card_window::show_main_window(tray.app_handle())
                {
                    logger::log_warn(&format!("[Tray] 左键恢复主窗口失败: {}", err));
                }
            }
        }
        TrayIconEvent::DoubleClick {
            button: MouseButton::Left,
            ..
        } => {
            #[cfg(target_os = "macos")]
            {
                return;
            }

            #[cfg(not(target_os = "macos"))]
            if let Err(err) =
                crate::modules::floating_card_window::show_main_window(tray.app_handle())
            {
                logger::log_warn(&format!("[Tray] 双击恢复主窗口失败: {}", err));
            }
        }
        _ => {}
    }
}

/// 请求更新托盘菜单（合并同一时间窗内的重复请求）
///
/// Rebuilding the menu re-reads every platform's account library from disk, so
/// the ~120 call sites that fire on any account mutation must not each pay for
/// one: a single quota refresh sweep touches a dozen platforms and used to queue
/// a dozen full rebuilds. Requests are collapsed into one trailing rebuild, then
/// native menu construction is applied in a single UI-thread pass.
include!("tray_menu_rebuild.rs");

/// 获取本地化文本
#[cfg(not(target_os = "macos"))]
fn get_text(key: &str, lang: &str) -> String {
    match (key, lang) {
        // 简体中文
        ("show_window", "zh-cn") => "显示主窗口".to_string(),
        ("show_floating_card", "zh-cn") => "显示悬浮卡片".to_string(),
        ("refresh_quota", "zh-cn") => "🔄 刷新配额".to_string(),
        ("settings", "zh-cn") => "⚙️ 设置...".to_string(),
        ("quit", "zh-cn") => "❌ 退出".to_string(),
        ("not_logged_in", "zh-cn") => "未登录".to_string(),
        ("loading", "zh-cn") => "加载中...".to_string(),
        ("reset", "zh-cn") => "重置".to_string(),
        ("reset_done", "zh-cn") => "已重置".to_string(),
        ("reset_unknown", "zh-cn") => "重置时间未知".to_string(),
        ("left", "zh-cn") => "剩余".to_string(),
        ("usage_status", "zh-cn") => "用量状态".to_string(),
        ("plan", "zh-cn") => "订阅".to_string(),
        ("claude_current_session", "zh-cn") => "Current session".to_string(),
        ("claude_current_week_all_models", "zh-cn") => "Current week (all models)".to_string(),
        ("token_spend", "zh-cn") => "Token 消耗".to_string(),
        ("edit_predictions", "zh-cn") => "编辑预测".to_string(),
        ("overdue_field", "zh-cn") => "是否欠费".to_string(),
        ("overdue_yes", "zh-cn") => "是".to_string(),
        ("overdue_no", "zh-cn") => "否".to_string(),
        ("status_normal_short", "zh-cn") => "正常".to_string(),
        ("included", "zh-cn") => "包含".to_string(),
        ("ghcp_inline", "zh-cn") => "Inline".to_string(),
        ("ghcp_chat", "zh-cn") => "Chat".to_string(),
        ("ghcp_premium", "zh-cn") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "zh-cn") => "每日额度用量".to_string(),
        ("windsurf_weekly_quota_usage", "zh-cn") => "每周额度用量".to_string(),
        ("windsurf_extra_usage_balance", "zh-cn") => "额外用量余额".to_string(),
        ("windsurf_credits_left", "zh-cn") => "剩余积分".to_string(),
        ("windsurf_prompt_credits_left", "zh-cn") => "Prompt Credits".to_string(),
        ("windsurf_addon_credits_available", "zh-cn") => "附加积分".to_string(),
        ("subscription_reset", "zh-cn") => "订阅重置".to_string(),
        ("more_platforms", "zh-cn") => "更多平台".to_string(),
        ("no_platform_selected", "zh-cn") => "未选择托盘平台".to_string(),

        // 繁体中文
        ("show_window", "zh-tw") => "顯示主視窗".to_string(),
        ("show_floating_card", "zh-tw") => "顯示懸浮卡片".to_string(),
        ("refresh_quota", "zh-tw") => "🔄 重新整理配額".to_string(),
        ("settings", "zh-tw") => "⚙️ 設定...".to_string(),
        ("quit", "zh-tw") => "❌ 結束".to_string(),
        ("not_logged_in", "zh-tw") => "未登入".to_string(),
        ("loading", "zh-tw") => "載入中...".to_string(),
        ("reset", "zh-tw") => "重置".to_string(),
        ("reset_done", "zh-tw") => "已重置".to_string(),
        ("reset_unknown", "zh-tw") => "重置時間未知".to_string(),
        ("left", "zh-tw") => "剩餘".to_string(),
        ("usage_status", "zh-tw") => "用量狀態".to_string(),
        ("plan", "zh-tw") => "訂閱".to_string(),
        ("claude_current_session", "zh-tw") => "目前工作階段".to_string(),
        ("claude_current_week_all_models", "zh-tw") => "本週（所有模型）".to_string(),
        ("token_spend", "zh-tw") => "Token 消耗".to_string(),
        ("edit_predictions", "zh-tw") => "編輯預測".to_string(),
        ("overdue_field", "zh-tw") => "是否欠費".to_string(),
        ("overdue_yes", "zh-tw") => "是".to_string(),
        ("overdue_no", "zh-tw") => "否".to_string(),
        ("status_normal_short", "zh-tw") => "正常".to_string(),
        ("included", "zh-tw") => "已包含".to_string(),
        ("ghcp_inline", "zh-tw") => "Inline".to_string(),
        ("ghcp_chat", "zh-tw") => "Chat".to_string(),
        ("ghcp_premium", "zh-tw") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "zh-tw") => "每日額度用量".to_string(),
        ("windsurf_weekly_quota_usage", "zh-tw") => "每週額度用量".to_string(),
        ("windsurf_extra_usage_balance", "zh-tw") => "額外用量餘額".to_string(),
        ("windsurf_credits_left", "zh-tw") => "剩餘積分".to_string(),
        ("windsurf_prompt_credits_left", "zh-tw") => "Prompt Credits".to_string(),
        ("windsurf_addon_credits_available", "zh-tw") => "附加積分".to_string(),
        ("subscription_reset", "zh-tw") => "訂閱重置".to_string(),
        ("more_platforms", "zh-tw") => "更多平台".to_string(),
        ("no_platform_selected", "zh-tw") => "未選擇托盤平台".to_string(),

        // 英文
        ("show_window", "en") => "Show Window".to_string(),
        ("show_floating_card", "en") => "Show Floating Card".to_string(),
        ("refresh_quota", "en") => "🔄 Refresh Quota".to_string(),
        ("settings", "en") => "⚙️ Settings...".to_string(),
        ("quit", "en") => "❌ Quit".to_string(),
        ("not_logged_in", "en") => "Not logged in".to_string(),
        ("loading", "en") => "Loading...".to_string(),
        ("reset", "en") => "Reset".to_string(),
        ("reset_done", "en") => "Reset done".to_string(),
        ("reset_unknown", "en") => "Reset time unknown".to_string(),
        ("left", "en") => "left".to_string(),
        ("usage_status", "en") => "Usage Status".to_string(),
        ("plan", "en") => "Plan".to_string(),
        ("claude_current_session", "en") => "Current session".to_string(),
        ("claude_current_week_all_models", "en") => "Current week (all models)".to_string(),
        ("token_spend", "en") => "Token Spend".to_string(),
        ("edit_predictions", "en") => "Edit Predictions".to_string(),
        ("overdue_field", "en") => "Overdue".to_string(),
        ("overdue_yes", "en") => "Yes".to_string(),
        ("overdue_no", "en") => "No".to_string(),
        ("status_normal_short", "en") => "Normal".to_string(),
        ("included", "en") => "Included".to_string(),
        ("ghcp_inline", "en") => "Inline".to_string(),
        ("ghcp_chat", "en") => "Chat".to_string(),
        ("ghcp_premium", "en") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "en") => "Daily quota usage".to_string(),
        ("windsurf_weekly_quota_usage", "en") => "Weekly quota usage".to_string(),
        ("windsurf_extra_usage_balance", "en") => "Extra usage balance".to_string(),
        ("windsurf_credits_left", "en") => "Credits left".to_string(),
        ("windsurf_prompt_credits_left", "en") => "Prompt credits left".to_string(),
        ("windsurf_addon_credits_available", "en") => "Add-on credits available".to_string(),
        ("subscription_reset", "en") => "Subscription reset".to_string(),
        ("more_platforms", "en") => "More platforms".to_string(),
        ("no_platform_selected", "en") => "No tray platforms selected".to_string(),

        // 日语
        ("show_window", "ja") => "ウィンドウを表示".to_string(),
        ("show_floating_card", "ja") => "フローティングカードを表示".to_string(),
        ("refresh_quota", "ja") => "🔄 クォータを更新".to_string(),
        ("settings", "ja") => "⚙️ 設定...".to_string(),
        ("quit", "ja") => "❌ 終了".to_string(),
        ("not_logged_in", "ja") => "未ログイン".to_string(),
        ("loading", "ja") => "読み込み中...".to_string(),
        ("reset", "ja") => "リセット".to_string(),
        ("reset_done", "ja") => "リセット済み".to_string(),
        ("reset_unknown", "ja") => "リセット時間不明".to_string(),
        ("left", "ja") => "残り".to_string(),
        ("usage_status", "ja") => "利用状況".to_string(),
        ("plan", "ja") => "プラン".to_string(),
        ("claude_current_session", "ja") => "現在のセッション".to_string(),
        ("claude_current_week_all_models", "ja") => "今週（全モデル）".to_string(),
        ("token_spend", "ja") => "Token Spend".to_string(),
        ("edit_predictions", "ja") => "Edit Predictions".to_string(),
        ("overdue_field", "ja") => "延滞有無".to_string(),
        ("overdue_yes", "ja") => "はい".to_string(),
        ("overdue_no", "ja") => "いいえ".to_string(),
        ("status_normal_short", "ja") => "正常".to_string(),
        ("included", "ja") => "含まれる".to_string(),
        ("ghcp_inline", "ja") => "Inline".to_string(),
        ("ghcp_chat", "ja") => "Chat".to_string(),
        ("ghcp_premium", "ja") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "ja") => "日次クォータ使用量".to_string(),
        ("windsurf_weekly_quota_usage", "ja") => "週次クォータ使用量".to_string(),
        ("windsurf_extra_usage_balance", "ja") => "追加使用残高".to_string(),
        ("windsurf_credits_left", "ja") => "残りクレジット".to_string(),
        ("windsurf_prompt_credits_left", "ja") => "Prompt Credits".to_string(),
        ("windsurf_addon_credits_available", "ja") => "追加クレジット".to_string(),
        ("subscription_reset", "ja") => "サブスクリプションリセット".to_string(),
        ("more_platforms", "ja") => "その他のプラットフォーム".to_string(),
        ("no_platform_selected", "ja") => {
            "トレイに表示するプラットフォームがありません".to_string()
        }

        // 俄语
        ("show_window", "ru") => "Показать окно".to_string(),
        ("show_floating_card", "ru") => "Показать плавающую карточку".to_string(),
        ("refresh_quota", "ru") => "🔄 Обновить квоту".to_string(),
        ("settings", "ru") => "⚙️ Настройки...".to_string(),
        ("quit", "ru") => "❌ Выход".to_string(),
        ("not_logged_in", "ru") => "Не авторизован".to_string(),
        ("loading", "ru") => "Загрузка...".to_string(),
        ("reset", "ru") => "Сброс".to_string(),
        ("reset_done", "ru") => "Сброс выполнен".to_string(),
        ("reset_unknown", "ru") => "Время сброса неизвестно".to_string(),
        ("left", "ru") => "осталось".to_string(),
        ("usage_status", "ru") => "Статус использования".to_string(),
        ("plan", "ru") => "План".to_string(),
        ("claude_current_session", "ru") => "Текущая сессия".to_string(),
        ("claude_current_week_all_models", "ru") => "Текущая неделя (все модели)".to_string(),
        ("token_spend", "ru") => "Token Spend".to_string(),
        ("edit_predictions", "ru") => "Edit Predictions".to_string(),
        ("overdue_field", "ru") => "Есть задолженность".to_string(),
        ("overdue_yes", "ru") => "Да".to_string(),
        ("overdue_no", "ru") => "Нет".to_string(),
        ("status_normal_short", "ru") => "Норма".to_string(),
        ("included", "ru") => "Включено".to_string(),
        ("ghcp_inline", "ru") => "Inline".to_string(),
        ("ghcp_chat", "ru") => "Chat".to_string(),
        ("ghcp_premium", "ru") => "Premium".to_string(),
        ("windsurf_daily_quota_usage", "ru") => "Дневная квота".to_string(),
        ("windsurf_weekly_quota_usage", "ru") => "Недельная квота".to_string(),
        ("windsurf_extra_usage_balance", "ru") => "Баланс доп. использования".to_string(),
        ("windsurf_credits_left", "ru") => "Остаток кредитов".to_string(),
        ("windsurf_prompt_credits_left", "ru") => "Prompt credits".to_string(),
        ("windsurf_addon_credits_available", "ru") => "Доп. кредиты".to_string(),
        ("subscription_reset", "ru") => "Сброс подписки".to_string(),
        ("more_platforms", "ru") => "Другие платформы".to_string(),
        ("no_platform_selected", "ru") => "Платформы для трея не выбраны".to_string(),

        // 默认英文
        ("show_window", _) => "Show Window".to_string(),
        ("show_floating_card", _) => "Show Floating Card".to_string(),
        ("refresh_quota", _) => "🔄 Refresh Quota".to_string(),
        ("settings", _) => "⚙️ Settings...".to_string(),
        ("quit", _) => "❌ Quit".to_string(),
        ("not_logged_in", _) => "Not logged in".to_string(),
        ("loading", _) => "Loading...".to_string(),
        ("reset", _) => "Reset".to_string(),
        ("reset_done", _) => "Reset done".to_string(),
        ("reset_unknown", _) => "Reset time unknown".to_string(),
        ("left", _) => "left".to_string(),
        ("usage_status", _) => "Usage Status".to_string(),
        ("plan", _) => "Plan".to_string(),
        ("claude_current_session", _) => "Current session".to_string(),
        ("claude_current_week_all_models", _) => "Current week (all models)".to_string(),
        ("token_spend", _) => "Token Spend".to_string(),
        ("edit_predictions", _) => "Edit Predictions".to_string(),
        ("overdue_field", _) => "Overdue".to_string(),
        ("overdue_yes", _) => "Yes".to_string(),
        ("overdue_no", _) => "No".to_string(),
        ("status_normal_short", _) => "Normal".to_string(),
        ("included", _) => "Included".to_string(),
        ("ghcp_inline", _) => "Inline".to_string(),
        ("ghcp_chat", _) => "Chat".to_string(),
        ("ghcp_premium", _) => "Premium".to_string(),
        ("windsurf_daily_quota_usage", _) => "Daily quota usage".to_string(),
        ("windsurf_weekly_quota_usage", _) => "Weekly quota usage".to_string(),
        ("windsurf_extra_usage_balance", _) => "Extra usage balance".to_string(),
        ("windsurf_credits_left", _) => "Credits left".to_string(),
        ("windsurf_prompt_credits_left", _) => "Prompt credits left".to_string(),
        ("windsurf_addon_credits_available", _) => "Add-on credits available".to_string(),
        ("subscription_reset", _) => "Subscription reset".to_string(),
        ("more_platforms", _) => "More platforms".to_string(),
        ("no_platform_selected", _) => "No tray platforms selected".to_string(),

        _ => key.to_string(),
    }
}

#[cfg(test)]
#[path = "tray_menu_rebuild_tests.rs"]
mod tray_menu_rebuild_tests;
