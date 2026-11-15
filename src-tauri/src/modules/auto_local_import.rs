use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use rusqlite::Connection;
use serde_json::Value;
use tauri::{AppHandle, Emitter};
use tokio::sync::Notify;

use crate::modules::{
    codex_account, config, import, logger,
};
use serde::Serialize;

const POLL_INTERVAL_SECONDS: u64 = 30;
const STARTUP_DELAY_SECONDS: u64 = 10;
const IDENTITY_SCAN_TIMEOUT: Duration = Duration::from_secs(15);

static WATCHER_STARTED: AtomicBool = AtomicBool::new(false);
static CONFIG_CHANGED: LazyLock<Notify> = LazyLock::new(Notify::new);
static LAST_IDENTITIES: LazyLock<Mutex<HashMap<String, String>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static WATCH_CYCLE_LOCK: LazyLock<tokio::sync::Mutex<()>> =
    LazyLock::new(|| tokio::sync::Mutex::new(()));
static IDENTITY_SCAN_IN_FLIGHT: AtomicBool = AtomicBool::new(false);

struct IdentityScanInFlightGuard;

impl Drop for IdentityScanInFlightGuard {
    fn drop(&mut self) {
        IDENTITY_SCAN_IN_FLIGHT.store(false, Ordering::SeqCst);
    }
}

type ImportFuture = Pin<Box<dyn Future<Output = Result<bool, String>> + Send>>;

struct PlatformWatcher {
    platform: &'static str,
    peek_identity: fn() -> Option<String>,
    import_account: fn() -> ImportFuture,
}

pub fn ensure_started(app_handle: AppHandle) {
    if WATCHER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    logger::log_info("[AutoLocalImport] 本机账号自动导入监听已启动");
    tauri::async_runtime::spawn(async move {
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(STARTUP_DELAY_SECONDS)) => {}
            _ = CONFIG_CHANGED.notified() => {}
        }

        loop {
            run_watch_cycle(&app_handle).await;
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(POLL_INTERVAL_SECONDS)) => {}
                _ = CONFIG_CHANGED.notified() => {}
            }
        }
    });
}

pub fn notify_config_changed(enabled: bool) {
    logger::log_info(&format!(
        "[AutoLocalImport] 本机账号自动导入设置已{}",
        if enabled { "启用" } else { "停用" }
    ));
    CONFIG_CHANGED.notify_one();
}

#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoLocalImportScanResult {
    pub scanned: u32,
    pub imported: u32,
    pub failed: u32,
    pub platforms: Vec<String>,
}

/// 开启时立即扫描：导入当前本机已登录身份，并写入基线。
/// 不强制校验开关，便于前端在 patch 落盘前触发首扫。
pub async fn scan_now(app_handle: AppHandle) -> Result<AutoLocalImportScanResult, String> {
    Ok(run_watch_cycle_with_mode(&app_handle, WatchMode::FullScanImport).await)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WatchMode {
    /// 后台轮询：首次只记基线；身份变化才导入。
    PollOnChange,
    /// 用户刚开启：有身份则尝试导入，并建立/刷新基线。
    FullScanImport,
}

fn identity_log_tag(identity: &str) -> String {
    // 避免日志写入完整邮箱/token 前缀。
    let digest = identity.bytes().fold(0u32, |acc, b| {
        acc.wrapping_mul(33).wrapping_add(u32::from(b))
    });
    format!("{:08x}", digest)
}

fn identity_key(parts: &[Option<String>]) -> Option<String> {
    let values: Vec<String> = parts
        .iter()
        .filter_map(|part| {
            part.as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
        })
        .collect();
    if values.is_empty() {
        None
    } else {
        Some(values.join("|"))
    }
}

fn read_vscdb_string_item(conn: &Connection, key: &str) -> Option<String> {
    conn.query_row("SELECT value FROM ItemTable WHERE key = ?1", [key], |row| {
        row.get::<_, String>(0)
    })
    .ok()
    .map(|value| value.trim().to_string())
    .filter(|value| !value.is_empty())
}

fn peek_antigravity_identity() -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let credential =
            crate::modules::antigravity_credential::read_antigravity_system_credential()
                .ok()
                .flatten()?;
        return identity_key(&[Some(credential.refresh_token.chars().take(24).collect())]);
    }

    #[cfg(not(target_os = "windows"))]
    {
        use base64::{engine::general_purpose, Engine as _};

        let db_path = crate::modules::db::get_db_path().ok()?;
        if !db_path.exists() {
            return None;
        }
        let conn = Connection::open(&db_path).ok()?;
        let state_data = read_vscdb_string_item(&conn, "antigravityUnifiedStateSync.oauthToken")?;
        let blob = general_purpose::STANDARD.decode(&state_data).ok()?;
        let refresh_token =
            crate::utils::protobuf::extract_refresh_token_from_unified_oauth_token(&blob)?;
        identity_key(&[Some(refresh_token.chars().take(24).collect())])
    }
}

fn peek_codex_identity() -> Option<String> {
    let auth_path = codex_account::get_auth_json_path();
    if !auth_path.exists() {
        return None;
    }
    let content = std::fs::read_to_string(&auth_path).ok()?;
    let auth_file: Value = serde_json::from_str(&content).ok()?;
    let email = auth_file
        .get("tokens")
        .and_then(|tokens| tokens.get("email"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let auth_mode = auth_file
        .get("auth_mode")
        .and_then(Value::as_str)
        .map(str::to_string);
    let api_key = auth_file
        .get("OPENAI_API_KEY")
        .and_then(Value::as_str)
        .map(|value| value.chars().take(16).collect::<String>());
    identity_key(&[email, auth_mode, api_key])
}

fn token_prefix(token: &str) -> Option<String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.chars().take(16).collect())
    }
}

fn import_antigravity() -> ImportFuture {
    Box::pin(async {
        import::import_from_local_logic()
            .await
            .map(|_| true)
            .map_err(|error| error.to_string())
    })
}

fn import_codex() -> ImportFuture {
    Box::pin(async { codex_account::import_from_local().map(|_| true) })
}

fn platform_watchers() -> Vec<PlatformWatcher> {
    vec![
        PlatformWatcher {
            platform: "antigravity",
            peek_identity: peek_antigravity_identity,
            import_account: import_antigravity,
        },
        PlatformWatcher {
            platform: "codex",
            peek_identity: peek_codex_identity,
            import_account: import_codex,
        },
    ]
}

async fn run_watch_cycle(app_handle: &AppHandle) {
    if !config::get_user_config().auto_import_from_local_enabled {
        return;
    }
    let _ = run_watch_cycle_with_mode(app_handle, WatchMode::PollOnChange).await;
}

struct PeekDecision {
    platform: &'static str,
    identity: String,
    should_import: bool,
    import_account: fn() -> ImportFuture,
}

/// Sync peek + identity baseline updates (SQLite/fs/keychain). Must not run on async workers.
fn collect_peek_decisions(mode: WatchMode) -> (u32, Vec<PeekDecision>) {
    let mut scanned = 0u32;
    let mut pending = Vec::new();

    for watcher in platform_watchers() {
        let current_identity = (watcher.peek_identity)();
        let Some(current_identity) = current_identity else {
            if let Ok(mut state) = LAST_IDENTITIES.lock() {
                state.remove(watcher.platform);
            }
            continue;
        };
        scanned += 1;

        let should_import = {
            let Ok(mut state) = LAST_IDENTITIES.lock() else {
                continue;
            };
            match mode {
                WatchMode::FullScanImport => true,
                WatchMode::PollOnChange => match state.get(watcher.platform) {
                    None => {
                        // 首次只建基线，避免应用启动时批量导入。
                        state.insert(watcher.platform.to_string(), current_identity.clone());
                        false
                    }
                    Some(previous) if previous == &current_identity => false,
                    Some(_) => true,
                },
            }
        };

        pending.push(PeekDecision {
            platform: watcher.platform,
            identity: current_identity,
            should_import,
            import_account: watcher.import_account,
        });
    }

    (scanned, pending)
}

async fn run_watch_cycle_with_mode(
    app_handle: &AppHandle,
    mode: WatchMode,
) -> AutoLocalImportScanResult {
    let _cycle_guard = match mode {
        WatchMode::FullScanImport => WATCH_CYCLE_LOCK.lock().await,
        WatchMode::PollOnChange => match WATCH_CYCLE_LOCK.try_lock() {
            Ok(guard) => guard,
            Err(_) => return AutoLocalImportScanResult::default(),
        },
    };
    if IDENTITY_SCAN_IN_FLIGHT.swap(true, Ordering::SeqCst) {
        logger::log_warn("[AutoLocalImport] 上一次本机身份扫描仍在运行，跳过重复扫描");
        return AutoLocalImportScanResult::default();
    }
    let task = tauri::async_runtime::spawn_blocking(move || {
        let _in_flight_guard = IdentityScanInFlightGuard;
        collect_peek_decisions(mode)
    });
    let (scanned, pending) = match tokio::time::timeout(IDENTITY_SCAN_TIMEOUT, task).await {
        Ok(Ok(result)) => result,
        Ok(Err(err)) => {
            logger::log_warn(&format!("[AutoLocalImport] 后台本机身份扫描失败: {}", err));
            return AutoLocalImportScanResult::default();
        }
        Err(err) => {
            logger::log_warn(&format!(
                "[AutoLocalImport] 本机身份扫描超时({:?})，后台任务完成前不再重复启动: {}",
                IDENTITY_SCAN_TIMEOUT, err
            ));
            return AutoLocalImportScanResult::default();
        }
    };

    let mut imported = 0u32;
    let mut failed = 0u32;
    let mut platforms = Vec::new();
    let mut imported_any = false;

    for decision in pending.into_iter().filter(|item| item.should_import) {
        match (decision.import_account)().await {
            Ok(true) => {
                if let Ok(mut state) = LAST_IDENTITIES.lock() {
                    state.insert(decision.platform.to_string(), decision.identity.clone());
                }
                imported += 1;
                imported_any = true;
                platforms.push(decision.platform.to_string());
                logger::log_info(&format!(
                    "[AutoLocalImport] 已自动导入本机账号: platform={}, identity_tag={}",
                    decision.platform,
                    identity_log_tag(&decision.identity)
                ));
                let _ = app_handle.emit(
                    "auto_local_import:completed",
                    serde_json::json!({
                        "platform": decision.platform,
                    }),
                );
                let _ = app_handle.emit(
                    "accounts:changed",
                    serde_json::json!({
                        "platformId": decision.platform,
                        "reason": "auto_import_from_local",
                    }),
                );
            }
            Ok(false) => {
                if let Ok(mut state) = LAST_IDENTITIES.lock() {
                    state.insert(decision.platform.to_string(), decision.identity);
                }
            }
            Err(error) => {
                failed += 1;
                logger::log_warn(&format!(
                    "[AutoLocalImport] 自动导入失败: platform={}, error={}",
                    decision.platform, error
                ));
            }
        }
    }

    if imported_any {
        crate::modules::websocket::broadcast_data_changed("auto_import_from_local");
        let _ = crate::modules::tray::update_tray_menu(app_handle);
    }

    AutoLocalImportScanResult {
        scanned,
        imported,
        failed,
        platforms,
    }
}

#[cfg(test)]
mod tests {
    use super::identity_key;

    #[test]
    fn identity_key_joins_non_empty_parts() {
        assert_eq!(
            identity_key(&[Some("a@example.com".to_string()), Some("id-1".to_string())]),
            Some("a@example.com|id-1".to_string())
        );
    }

    #[test]
    fn identity_key_returns_none_for_empty_parts() {
        assert_eq!(identity_key(&[None, Some("".to_string())]), None);
    }
}
