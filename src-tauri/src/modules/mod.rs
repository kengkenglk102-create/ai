pub mod account;
pub mod account_index_repair;
pub(crate) mod background_maintenance;
pub(crate) mod usage_rollup;
pub mod announcement;
pub mod apikey_fun_links;
pub mod antigravity_credential;
pub mod antigravity_legacy_instance;
pub mod antigravity_paths;
pub mod antigravity_switch_history;
pub mod app_lifecycle;
pub mod atomic_write;
pub mod auto_local_import;
pub mod backup_directory_recovery;
pub mod backup_storage;
pub mod client_version;
pub mod codex_account;
pub mod codex_device_restrictions;
pub mod chatgpt_plan;
pub mod chatgpt_plan_service;
pub mod codex_account_proxy;
pub mod codex_proxy_probe;
pub mod codex_proxy_engine;
pub mod codex_proxy_engine_preflight;
pub mod codex_proxy_activity;
pub mod codex_proxy_engine_install;
mod codex_proxy_engine_archive;
pub mod codex_proxy_runtime;
pub mod codex_proxy_desktop_router;
pub mod codex_proxy_node_parser;
pub mod codex_agent_identity;
pub mod codex_app_injection;
pub(crate) mod codex_app_enhancements;
pub(crate) mod codex_cli_daemon;
pub mod codex_auth_diagnostic;
pub mod codex_config_format;
pub mod codex_instance;
pub mod codex_profile_copy;
pub mod codex_local_access;
pub(crate) mod codex_remote_service;
pub(crate) mod codex_request_summary;
pub mod codex_native_api;
pub(crate) mod codex_continuity_worker;
pub mod codex_api_identity;
pub mod codex_managed_model_catalog_version;
pub mod codex_oauth;
pub(crate) mod codex_provider_protocol;
pub mod codex_pelican;
pub mod codex_pelican_preview;
pub mod codex_official_app_server;
pub mod codex_protocol;
pub mod codex_quota;
pub(crate) mod codex_quota_sync;
pub mod codex_temp_login;
pub(crate) mod codex_quota_refresh_scheduler;
pub(crate) mod codex_session_display;
pub mod codex_session_file_time;
pub(crate) mod codex_session_import_paths;
pub mod codex_session_history_sanitize;
pub mod codex_session_rollout_sanitize;
pub mod codex_session_manager;
pub mod codex_session_usage;
pub mod codex_session_visibility;
pub(crate) mod codex_history_projection_repair;
pub mod codex_speed;
pub(crate) mod codex_model_catalog_capabilities;
pub mod codex_ssh;
pub mod codex_thread_sync;
pub mod codex_wakeup;
pub mod codex_wakeup_scheduler;
pub mod codex_wakeup_confirmation;
pub mod config;
pub mod data_paths;
pub mod db;
pub mod deferred_account_rewrite;
pub mod diagnostics;
pub mod external_import;
pub mod floating_card_window;
pub mod group_settings;
pub mod hermes_auth;
pub mod i18n;
pub mod import;
pub mod instance;
pub mod instance_storage_cleanup;
pub mod instance_directory_ownership;
pub mod instance_store;
pub mod linux_updater;
pub mod logger;
pub mod macos_native_menu;
pub mod main_window_state;
pub mod oauth;
pub mod oauth_pending_state;
pub mod oauth_server;
pub mod openclaw_auth;
pub mod opencode_auth;
pub mod process;
pub(crate) mod profile_file_copy;
pub mod process_memory;
pub mod process_timeout;
pub mod provider_current_state;
pub mod provider_token_keeper;
pub mod quota;
pub mod quota_cache;
pub mod remote_config;
pub mod secure_account_storage;
pub mod sponsor_route_sync;
pub mod ssh_server;
pub mod sync_settings;
#[cfg(test)]
pub mod test_support;
pub mod tray;
pub mod tray_layout;
pub mod ui_preferences;
pub mod update_checker;
pub mod user_memory;
pub mod vscode_inject;
pub mod vscode_paths;
pub mod wakeup;
pub mod wakeup_gateway;
pub mod wakeup_history;
pub mod wakeup_scheduler;
pub mod wakeup_verification;
pub mod web_report;
pub mod webdav_domain;
pub mod webdav_sync;
pub mod webkit_cache_maintenance;
pub mod websocket;
pub mod windows_operation;

// 重新导出常用函数
pub use account::*;

pub mod codex_proxy_catalog;
pub mod codex_unified_proxy;
pub mod codex_proxy_manual_import;
pub mod codex_proxy_network;
pub mod codex_proxy_engine_errors;
pub mod codex_proxy_catalog_binding;
pub mod codex_proxy_subscription_parser;

pub mod codex_client_proxy;
pub mod codex_proxy_targets;

pub(crate) mod workbuddy_instance {
    use std::path::PathBuf;
    pub fn resolve_workbuddy_runtime_dirs(user_data_dir: &str) -> Result<(PathBuf, PathBuf), String> {
        let p = PathBuf::from(user_data_dir);
        Ok((p.clone(), p))
    }
    pub fn get_default_workbuddy_user_data_dir() -> Result<PathBuf, String> {
        Err("Workbuddy is disabled".to_string())
    }
}

pub(crate) mod qoder_instance {
    use std::path::PathBuf;
    pub fn get_default_qoder_user_data_dir() -> Result<PathBuf, String> {
        Err("Qoder is disabled".to_string())
    }
}

pub(crate) mod trae_account {
    use std::path::PathBuf;

    #[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
    pub enum TraePlatformKind {
        Trae,
        TraeSolo,
        TraeCn,
        TraeSoloCn,
    }

    impl TraePlatformKind {
        pub fn parse(s: Option<&str>) -> Result<Self, String> {
            match s.unwrap_or("trae") {
                "trae_solo" | "trae-solo" => Ok(Self::TraeSolo),
                "trae_cn" | "trae-cn" => Ok(Self::TraeCn),
                "trae_solo_cn" | "trae-solo-cn" => Ok(Self::TraeSoloCn),
                _ => Ok(Self::Trae),
            }
        }
        pub fn display_name(&self) -> &'static str { "Trae" }
        pub fn provider_key(&self) -> &'static str { "trae" }
        pub fn app_support_dir_name(&self) -> &'static str { "Trae" }
    }

    pub fn get_default_trae_data_dir_for_platform(_platform: TraePlatformKind) -> Result<PathBuf, String> {
        Err("Trae is disabled".to_string())
    }

    pub fn windows_trae_install_base_paths(_kind: TraePlatformKind) -> Vec<PathBuf> {
        Vec::new()
    }
}
