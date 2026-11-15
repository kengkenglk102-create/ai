use std::collections::{HashMap, HashSet};
use std::future::Future;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::Value;
use tauri::AppHandle;
use tokio::sync::Notify;

use crate::modules::{
    codex_account, config, logger,
};

const TOKEN_KEEPER_TICK_SECONDS: u64 = 60;
const TOKEN_KEEPER_STARTUP_DELAY_SECONDS: u64 = 5 * 60;
const TOKEN_KEEPER_MAX_REFRESHES_PER_PLATFORM: usize = 3;
const TOKEN_KEEPER_IDLE_SCAN_SECONDS: i64 = 10 * 60;
const TOKEN_KEEPER_ACTIVE_SCAN_SECONDS: i64 = 60;
const TOKEN_REFRESH_LEAD_SECONDS: i64 = 15 * 60;
const TOKEN_REFRESH_LEAD_MILLISECONDS: i64 = TOKEN_REFRESH_LEAD_SECONDS * 1000;
const REFRESH_FAILURE_BACKOFF_SECONDS: i64 = 15 * 60;
/// Trae session-expired / mutual-refresh failures need a longer cool-down so we do not
/// keep hammering ExchangeToken with a rotated-away refresh token.
const TRAE_SESSION_EXPIRED_BACKOFF_SECONDS: i64 = 60 * 60;
const TRAE_STRICT_CHECK_INTERVAL_SECONDS: i64 = 10 * 60;
const TOKEN_KEEPER_LIST_TIMEOUT: Duration = Duration::from_secs(15);

static TOKEN_KEEPER_STARTED: AtomicBool = AtomicBool::new(false);
static TOKEN_KEEPER_CONFIG_CHANGED: LazyLock<Notify> = LazyLock::new(Notify::new);
static NEXT_ALLOWED_ATTEMPT_AT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_PLATFORM_SCAN_AT: LazyLock<Mutex<HashMap<&'static str, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_TRAE_STRICT_CHECK_AT: LazyLock<Mutex<HashMap<String, i64>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static ACCOUNT_LIST_IN_FLIGHT: LazyLock<Mutex<HashSet<&'static str>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

struct AccountListInFlightGuard(&'static str);

impl Drop for AccountListInFlightGuard {
    fn drop(&mut self) {
        if let Ok(mut in_flight) = ACCOUNT_LIST_IN_FLIGHT.lock() {
            in_flight.remove(self.0);
        }
    }
}

pub fn ensure_started(app_handle: AppHandle) {
    if TOKEN_KEEPER_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }

    logger::log_info("[TokenKeeper] 后端 OAuth token 保活已启动");
    tauri::async_runtime::spawn(async move {
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(TOKEN_KEEPER_STARTUP_DELAY_SECONDS)) => {}
            _ = TOKEN_KEEPER_CONFIG_CHANGED.notified() => {}
        }

        loop {
            run_refresh_cycle(&app_handle).await;
            tokio::select! {
                _ = tokio::time::sleep(Duration::from_secs(TOKEN_KEEPER_TICK_SECONDS)) => {}
                _ = TOKEN_KEEPER_CONFIG_CHANGED.notified() => {}
            }
        }
    });
}

pub fn notify_config_changed(app_handle: AppHandle, enabled: bool) {
    ensure_started(app_handle);
    reset_platform_scan_schedule();
    logger::log_info(&format!(
        "[TokenKeeper] 后台 OAuth token 保活设置已{}，已同步运行时状态",
        if enabled { "启用" } else { "停用" }
    ));
    TOKEN_KEEPER_CONFIG_CHANGED.notify_one();
}

async fn list_accounts_blocking<T, F>(platform: &'static str, list: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T, String> + Send + 'static,
{
    {
        let mut in_flight = ACCOUNT_LIST_IN_FLIGHT
            .lock()
            .map_err(|_| format!("[TokenKeeper][{platform}] 账号列表单飞锁已损坏"))?;
        if !in_flight.insert(platform) {
            return Err(format!(
                "[TokenKeeper][{platform}] 上一次账号列表读取仍在运行，跳过本轮"
            ));
        }
    }

    let task = tauri::async_runtime::spawn_blocking(move || {
        let _in_flight_guard = AccountListInFlightGuard(platform);
        list()
    });
    tokio::time::timeout(TOKEN_KEEPER_LIST_TIMEOUT, task)
        .await
        .map_err(|_| {
            format!(
                "[TokenKeeper][{platform}] 账号列表读取超时({:?})，后台任务完成前不再重复启动",
                TOKEN_KEEPER_LIST_TIMEOUT
            )
        })?
        .map_err(|e| format!("[TokenKeeper][{platform}] 后台读取账号列表失败: {e}"))?
}

async fn run_refresh_cycle(app_handle: &AppHandle) {
    if !config::get_user_config().token_keeper_enabled {
        return;
    }

    let mut refreshed_any = false;
    refreshed_any |= refresh_platform_if_due("codex", refresh_due_codex_accounts).await;

    if refreshed_any {
        let _ = crate::modules::tray::update_tray_menu(app_handle);
    }
}

fn now_ts() -> i64 {
    chrono::Utc::now().timestamp()
}

fn now_ts_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn allow_platform_scan(platform: &'static str) -> bool {
    let now = now_ts();
    let Ok(state) = NEXT_PLATFORM_SCAN_AT.lock() else {
        return true;
    };
    state.get(platform).map(|next| *next <= now).unwrap_or(true)
}

fn mark_platform_scan(platform: &'static str, refreshed_any: bool) {
    let next_delay = if refreshed_any {
        TOKEN_KEEPER_ACTIVE_SCAN_SECONDS
    } else {
        TOKEN_KEEPER_IDLE_SCAN_SECONDS
    };
    if let Ok(mut state) = NEXT_PLATFORM_SCAN_AT.lock() {
        state.insert(platform, now_ts() + next_delay);
    }
}

fn reset_platform_scan_schedule() {
    if let Ok(mut state) = NEXT_PLATFORM_SCAN_AT.lock() {
        state.clear();
    }
}

async fn refresh_platform_if_due<F, Fut>(platform: &'static str, refresh: F) -> bool
where
    F: FnOnce() -> Fut,
    Fut: Future<Output = bool>,
{
    if !allow_platform_scan(platform) {
        return false;
    }

    let refreshed_any = refresh().await;
    mark_platform_scan(platform, refreshed_any);
    refreshed_any
}

fn reached_platform_refresh_limit(attempted_refreshes: usize) -> bool {
    attempted_refreshes >= TOKEN_KEEPER_MAX_REFRESHES_PER_PLATFORM
}

fn decode_jwt_exp(token: &str) -> Option<i64> {
    let payload_base64 = token.split('.').nth(1)?;
    let payload_bytes = URL_SAFE_NO_PAD.decode(payload_base64).ok()?;
    let payload: Value = serde_json::from_slice(&payload_bytes).ok()?;
    payload.get("exp").and_then(Value::as_i64)
}

fn jwt_token_expires_soon(token: &str, skew_seconds: i64) -> bool {
    decode_jwt_exp(token)
        .map(|exp| exp <= now_ts() + skew_seconds)
        .unwrap_or(true)
}

fn expires_at_seconds_due(expires_at: Option<i64>) -> bool {
    expires_at
        .map(|value| value <= now_ts() + TOKEN_REFRESH_LEAD_SECONDS)
        .unwrap_or(true)
}

fn expires_at_milliseconds_due(expires_at: Option<i64>) -> bool {
    expires_at
        .map(|value| value <= now_ts_ms() + TOKEN_REFRESH_LEAD_MILLISECONDS)
        .unwrap_or(true)
}

fn allow_attempt(key: &str) -> bool {
    let now = now_ts();
    let Ok(state) = NEXT_ALLOWED_ATTEMPT_AT.lock() else {
        return true;
    };
    state.get(key).map(|next| *next <= now).unwrap_or(true)
}

fn clear_attempt_backoff(key: &str) {
    if let Ok(mut state) = NEXT_ALLOWED_ATTEMPT_AT.lock() {
        state.remove(key);
    }
}

fn mark_attempt_failure(key: &str) {
    mark_attempt_failure_with_backoff(key, REFRESH_FAILURE_BACKOFF_SECONDS);
}

fn mark_attempt_failure_with_backoff(key: &str, backoff_seconds: i64) {
    if let Ok(mut state) = NEXT_ALLOWED_ATTEMPT_AT.lock() {
        state.insert(key.to_string(), now_ts() + backoff_seconds);
    }
}

fn trae_refresh_failure_backoff_seconds(err: &str) -> i64 {
    if err.contains("会话已过期")
        || err.contains("未认证")
        || err.contains("设备密钥缺失")
        || err.contains("互刷")
        || err.contains("ExchangeToken")
    {
        TRAE_SESSION_EXPIRED_BACKOFF_SECONDS
    } else {
        REFRESH_FAILURE_BACKOFF_SECONDS
    }
}

fn should_run_trae_strict_check(account_id: &str) -> bool {
    let now = now_ts();
    let Ok(state) = NEXT_TRAE_STRICT_CHECK_AT.lock() else {
        return true;
    };
    state
        .get(account_id)
        .map(|next| *next <= now)
        .unwrap_or(true)
}

fn mark_trae_strict_check_done(account_id: &str) {
    if let Ok(mut state) = NEXT_TRAE_STRICT_CHECK_AT.lock() {
        state.insert(
            account_id.to_string(),
            now_ts() + TRAE_STRICT_CHECK_INTERVAL_SECONDS,
        );
    }
}

async fn refresh_due_codex_accounts() -> bool {
    let accounts = match list_accounts_blocking("codex", codex_account::list_accounts_checked).await
    {
        Ok(accounts) => accounts,
        Err(err) => {
            logger::log_warn(&format!(
                "[TokenKeeper][Codex] 读取账号列表失败，跳过本轮保活: {}",
                err
            ));
            return false;
        }
    };

    let mut refreshed_any = false;
    let mut attempted_refreshes = 0usize;
    for account in accounts
        .into_iter()
        .filter(|account| !account.is_api_key_auth())
    {
        if reached_platform_refresh_limit(attempted_refreshes) {
            break;
        }
        if !account.requires_reauth && !codex_account::is_managed_auth_refresh_due(&account) {
            continue;
        }

        let key = format!("codex:{}", account.id);
        if !allow_attempt(&key) {
            continue;
        }

        attempted_refreshes += 1;
        match codex_account::keepalive_managed_account(&account.id, "TokenKeeper 授权保活").await
        {
            Ok(updated) => {
                clear_attempt_backoff(&key);
                refreshed_any = true;
                logger::log_info(&format!(
                    "[TokenKeeper][Codex] Token 保活成功: account_id={}, email={}",
                    updated.id, updated.email
                ));
            }
            Err(err) => {
                mark_attempt_failure(&key);
                logger::log_warn(&format!(
                    "[TokenKeeper][Codex] Token 保活失败，进入退避: account_id={}, error={}",
                    account.id, err
                ));
            }
        }
    }

    refreshed_any
}
