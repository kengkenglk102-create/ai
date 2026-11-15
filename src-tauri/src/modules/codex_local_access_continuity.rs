// Both protocol engines share identity storage and credential ownership.
fn native_global_identity_path() -> Result<PathBuf, String> {
    Ok(account::get_data_dir()?
        .join("codex_native_api")
        .join("identity.sqlite"))
}

fn continuity_account_owner(account: CodexAccount) -> Result<String, String> {
    let base = if account.is_api_key_auth() {
        account
            .api_base_url
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "https://api.openai.com/v1".into())
    } else {
        "https://chatgpt.com/backend-api/codex".to_string()
    };
    Ok(native_account_owner(&account, &base))
}
