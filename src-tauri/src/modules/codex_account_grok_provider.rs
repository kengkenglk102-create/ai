// Codex 账号模块：Grok(xAI) 供应商账号。
//
// 这类账号自身不带上游 API Key，上游凭据来自 Cockpit 已登录的 Grok 平台账号（OAuth）。
// 本地网关启动时把该 Grok 账号的访问令牌写成 sidecar 的 xai auth 文件，由 sidecar
// 内置的 Grok(xAI) 执行器完成上游请求，因此模型目录、混合模型路由与 API 服务的
// 行为与其它供应商账号一致。
//
// 通过 include! 保持原 modules::codex_account 作用域和私有调用关系。

// Grok platform disabled

/// Grok 供应商账号的 provider id（与前端预设保持一致）。
pub(crate) const GROK_PROVIDER_ID: &str = "grok";
pub(crate) const GROK_PROVIDER_NAME: &str = "Grok";
/// Grok CLI 聊天代理地址：OAuth（订阅）账号的默认上游。
pub(crate) const GROK_CLI_CHAT_PROXY_BASE_URL: &str = "https://cli-chat-proxy.grok.com/v1";
/// Grok 账号带入 Codex 的默认模型目录；用户可在「模型与能力」中继续增删。
pub(crate) const GROK_CODEX_MODELS: &[&str] = &["grok-4.7", "grok-4.6", "grok-4.5", "grok-4.3"];
/// 默认支持图片输入的 Grok 模型（与上游能力对齐，可被用户覆盖）。
pub(crate) const GROK_VISION_CODEX_MODELS: &[&str] = GROK_CODEX_MODELS;
const GROK_MODEL_CATALOG_VERSION: u32 = 1;

/// Only the unchanged old default list follows new defaults. Partial/custom lists,
/// including an intentionally empty list, remain under the user's control.
fn upgrade_grok_default_model_catalog(account: &mut CodexAccount) -> bool {
    if !is_grok_upstream_provider(account)
        || account.grok_model_catalog_version.unwrap_or(0) >= GROK_MODEL_CATALOG_VERSION
    {
        return false;
    }
    account.grok_model_catalog_version = Some(GROK_MODEL_CATALOG_VERSION);
    if account.api_model_catalog != ["grok-4.6", "grok-4.5", "grok-4.3"] {
        return true;
    }
    // In the absence of an explicit startup selection, the old first item was
    // the default. Adding a new model must not silently change that selection.
    if normalize_optional_ref(account.api_startup_model.as_deref()).is_none() {
        account.api_startup_model = account.api_model_catalog.first().cloned();
    }
    account.api_model_catalog.insert(0, "grok-4.7".to_string());
    account
        .api_model_vision_support
        .entry("grok-4.7".to_string())
        .or_insert(true);
    true
}

fn select_grok_provider_model_catalog(
    supplied: Option<Vec<String>>,
    existing: Option<&CodexAccount>,
) -> Vec<String> {
    normalize_api_model_catalog(supplied.unwrap_or_else(|| {
        existing
            .map(|account| account.api_model_catalog.clone())
            .unwrap_or_else(grok_provider_model_catalog)
    }))
}

/// 账号是否绑定 Grok 平台账号作为上游（即 Grok 供应商账号）。
pub fn is_grok_upstream_provider(account: &CodexAccount) -> bool {
    account.is_api_key_auth()
        && account
            .upstream_grok_account_id
            .as_deref()
            .map(str::trim)
            .is_some_and(|value| !value.is_empty())
}

/// Grok 供应商账号默认带入的模型目录。
pub(crate) fn grok_provider_model_catalog() -> Vec<String> {
    GROK_CODEX_MODELS
        .iter()
        .map(|model| (*model).to_string())
        .collect()
}

pub(crate) fn grok_provider_vision_support() -> HashMap<String, bool> {
    GROK_VISION_CODEX_MODELS
        .iter()
        .map(|model| ((*model).to_string(), true))
        .collect()
}

/// Grok 供应商账号的存储 ID：同一个 Grok 账号重复添加时幂等。
pub(crate) fn build_grok_provider_account_id(grok_account_id: &str) -> String {
    format!(
        "codex_grok_{:x}",
        md5::compute(grok_account_id.trim().as_bytes())
    )
}

pub fn grok_sidecar_auth_file_name(account_id: &str) -> String {
    format!("grok_auth_{account_id}.json")
}

pub(crate) fn grok_sidecar_auth_json(
    _account: &CodexAccount,
    _proxy_url: Option<&str>,
) -> Result<serde_json::Value, String> {
    Err("Grok platform is disabled".to_string())
}

pub fn upsert_grok_provider_account(
    _grok_account_id: &str,
    _grok_email: &str,
    _model_catalog: Option<Vec<String>>,
    _account_name: Option<String>,
) -> Result<CodexAccount, String> {
    Err("Grok platform is disabled".to_string())
}

fn grok_access_token_expired_at(expires_at_seconds: i64) -> Option<String> {
    if expires_at_seconds <= 0 {
        return None;
    }
    chrono::DateTime::<chrono::Utc>::from_timestamp(expires_at_seconds, 0)
        .map(|value| value.to_rfc3339_opts(chrono::SecondsFormat::Secs, true))
}

#[cfg(test)]
mod grok_provider_tests {
    use super::*;

    fn grok_provider_account() -> CodexAccount {
        let mut account = CodexAccount::new_api_key(
            "codex_grok_test".to_string(),
            "grok@example.com".to_string(),
            String::new(),
            CodexApiProviderMode::Custom,
            Some(GROK_CLI_CHAT_PROXY_BASE_URL.to_string()),
            Some(GROK_PROVIDER_ID.to_string()),
            Some(GROK_PROVIDER_NAME.to_string()),
            grok_provider_model_catalog(),
        );
        account.upstream_grok_account_id = Some("grok-account-1".to_string());
        account
    }

    #[test]
    fn detects_only_bound_grok_provider_accounts() {
        let mut account = grok_provider_account();
        assert!(is_grok_upstream_provider(&account));

        account.upstream_grok_account_id = Some("   ".to_string());
        assert!(!is_grok_upstream_provider(&account));

        account.upstream_grok_account_id = None;
        assert!(!is_grok_upstream_provider(&account));
    }

    #[test]
    fn plain_api_key_accounts_are_not_grok_providers() {
        let account = CodexAccount::new_api_key(
            "codex_deepseek_test".to_string(),
            "deepseek@example.com".to_string(),
            "sk-test".to_string(),
            CodexApiProviderMode::Custom,
            Some("https://api.deepseek.com".to_string()),
            Some("deepseek".to_string()),
            Some("DeepSeek".to_string()),
            vec!["deepseek-flash".to_string()],
        );
        assert!(!is_grok_upstream_provider(&account));
    }

    #[test]
    fn grok_provider_account_id_is_stable_and_trimmed() {
        let first = build_grok_provider_account_id("grok-account-1");
        let second = build_grok_provider_account_id("  grok-account-1  ");
        assert_eq!(first, second);
        assert!(first.starts_with("codex_grok_"));
        assert_ne!(first, build_grok_provider_account_id("grok-account-2"));
    }

    #[test]
    fn grok_sidecar_auth_file_name_matches_account_scope_id() {
        assert_eq!(
            grok_sidecar_auth_file_name("codex_grok_test"),
            "xai-codex_grok_test.json"
        );
    }

    #[test]
    fn default_model_catalog_covers_grok_models() {
        let catalog = grok_provider_model_catalog();
        assert_eq!(catalog.first().map(String::as_str), Some("grok-4.7"));
        assert!(catalog.iter().any(|model| model == "grok-4.6"));
        assert!(catalog.iter().any(|model| model == "grok-4.5"));
        assert!(!catalog.iter().any(|model| model.contains("build-fast")));
        assert!(grok_provider_vision_support().values().all(|value| *value));
    }

    #[test]
    fn old_default_catalog_upgrades_once_and_keeps_startup_and_capabilities() {
        let mut account = grok_provider_account();
        account.api_model_catalog = vec!["grok-4.6".into(), "grok-4.5".into(), "grok-4.3".into()];
        account
            .api_model_vision_support
            .insert("grok-4.7".into(), false);
        assert!(upgrade_grok_default_model_catalog(&mut account));
        assert_eq!(account.api_model_catalog, grok_provider_model_catalog());
        assert_eq!(account.api_startup_model.as_deref(), Some("grok-4.6"));
        assert_eq!(account.api_model_vision_support["grok-4.7"], false);
        assert!(!upgrade_grok_default_model_catalog(&mut account));
        account.api_model_catalog.remove(0);
        let encoded = serde_json::to_value(&account).unwrap();
        let mut account: CodexAccount = serde_json::from_value(encoded).unwrap();
        assert!(!upgrade_grok_default_model_catalog(&mut account));
        assert!(!account
            .api_model_catalog
            .iter()
            .any(|model| model == "grok-4.7"));
    }

    #[test]
    fn explicit_grok_catalog_edits_and_startup_selection_are_preserved() {
        for catalog in [
            vec![],
            vec!["grok-4.6".into()],
            vec!["custom-model".into(), "grok-4.6".into()],
        ] {
            let mut account = grok_provider_account();
            account.api_model_catalog = catalog.clone();
            account.api_startup_model = Some("custom-model".into());
            assert!(upgrade_grok_default_model_catalog(&mut account));
            assert!(!upgrade_grok_default_model_catalog(&mut account));
            assert_eq!(
                select_grok_provider_model_catalog(None, Some(&account)),
                catalog
            );
            assert_eq!(account.api_startup_model.as_deref(), Some("custom-model"));
        }
        let mut account = grok_provider_account();
        account.api_model_catalog = vec!["grok-4.6".into(), "grok-4.5".into(), "grok-4.3".into()];
        account.api_startup_model = Some("grok-4.3".into());
        assert!(upgrade_grok_default_model_catalog(&mut account));
        assert_eq!(account.api_startup_model.as_deref(), Some("grok-4.3"));
        assert!(select_grok_provider_model_catalog(Some(vec![]), Some(&account)).is_empty());
    }

    #[test]
    fn grok_access_token_expiry_uses_unix_seconds() {
        assert_eq!(
            grok_access_token_expired_at(1_893_456_000).as_deref(),
            Some("2030-01-01T00:00:00Z")
        );
        assert_eq!(grok_access_token_expired_at(0), None);
    }
}
