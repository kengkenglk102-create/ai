use tauri::AppHandle;

#[tauri::command]
pub async fn get_provider_current_account_id(
    _app: AppHandle,
    _platform: String,
) -> Result<Option<String>, String> {
    Ok(None)
}
