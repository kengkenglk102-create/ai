fn build_platform_cards(
        platform: PlatformId,
        lang: &str,
    ) -> (Vec<AccountCard>, Option<String>, Option<String>) {
        match platform {
            PlatformId::Antigravity => build_antigravity_cards(lang),
            PlatformId::Codex => build_codex_cards(lang),
        }
    }

    fn build_antigravity_cards(lang: &str) -> (Vec<AccountCard>, Option<String>, Option<String>) {
        let accounts = modules::account::list_accounts().unwrap_or_default();
        let current_id = modules::account::get_current_account()
            .ok()
            .flatten()
            .map(|account| account.id);

        let mut sorted = accounts;
        sorted.sort_by_key(|account| std::cmp::Reverse(account.last_used.max(account.created_at)));

        let recommended = current_id
            .as_deref()
            .and_then(|id| modules::account::pick_quota_alert_recommendation(&sorted, id))
            .map(|account| account.id);

        let cards = sorted
            .into_iter()
            .map(|account| {
                let quota = account.quota.as_ref();
                let quota_rows = build_antigravity_quota_rows(lang, quota);
                AccountCard {
                    id: account.id,
                    title: account.email,
                    plan: resolve_antigravity_plan_label(quota),
                    updated_at: display_updated_at(
                        account.usage_updated_at,
                        account.last_used,
                        account.created_at,
                    ),
                    remaining_percent: min_quota_progress(&quota_rows, true),
                    quota_rows,
                }
            })
            .collect();

        (cards, current_id, recommended)
    }

    fn localize_codex_pool_window_label(lang: &str, label: &str) -> String {
        // 与前端 formatCodexQuotaPoolWindowLabel 对齐：Weekly → 周。
        if label.eq_ignore_ascii_case("Weekly") {
            return translate_or(lang, "codex.localAccess.quotaPool.weeklyShort", "周", &[]);
        }
        label.to_string()
    }

    fn build_codex_api_service_card(lang: &str) -> AccountCard {
        let pool = modules::codex_local_access::menu_bar_api_service_quota();
        let mut rows = Vec::new();

        for window in &pool.windows {
            let tone_pct = window.percentage.clamp(0, 100);
            rows.push(make_progress_row(
                localize_codex_pool_window_label(lang, &window.label),
                format!("{}%", window.percentage),
                tone_pct,
                None,
                codex_remaining_tone(tone_pct),
            ));
        }
        if rows.is_empty() {
            rows.push(make_text_row(
                translate_or(lang, "common.shared.quota.noData", "No quota data", &[]),
                "-".to_string(),
                Some(modules::i18n::translate(lang, "common.refresh", &[])),
            ));
        } else {
            rows.insert(
                0,
                make_text_row(
                    translate_or(
                        lang,
                        "settings.general.codexAppUiInjectionPoolLabel",
                        "Accounts",
                        &[],
                    ),
                    pool.account_count.to_string(),
                    None,
                ),
            );
        }

        AccountCard {
            id: modules::codex_instance::CODEX_API_SERVICE_BIND_ACCOUNT_ID.to_string(),
            title: translate_or(lang, "codex.localAccess.title", "API Service", &[]),
            plan: Some("API".to_string()),
            updated_at: Some(chrono::Utc::now().timestamp()),
            quota_rows: rows,
            remaining_percent: pool.remaining_percent,
        }
    }

    fn build_codex_cards(lang: &str) -> (Vec<AccountCard>, Option<String>, Option<String>) {
        let mut accounts = modules::codex_account::list_accounts();
        let api_service_current = is_codex_api_service_current();
        let current_id = if api_service_current {
            Some(modules::codex_instance::CODEX_API_SERVICE_BIND_ACCOUNT_ID.to_string())
        } else {
            modules::codex_account::resolve_current_account_id(&accounts)
        };
        accounts
            .sort_by_key(|account| std::cmp::Reverse(account.last_used.max(account.created_at)));

        let recommended = current_id.as_deref().and_then(|id| {
            if modules::codex_instance::is_api_service_bind_account_id(id) {
                return None;
            }
            accounts
                .iter()
                .filter(|account| account.id != id && account.quota.is_some())
                .max_by(|left, right| {
                    let score_left = left
                        .quota
                        .as_ref()
                        .map(|quota| quota.hourly_percentage + quota.weekly_percentage)
                        .unwrap_or(-1);
                    let score_right = right
                        .quota
                        .as_ref()
                        .map(|quota| quota.hourly_percentage + quota.weekly_percentage)
                        .unwrap_or(-1);
                    score_left.cmp(&score_right)
                })
                .map(|account| account.id.clone())
        });

        let mut cards: Vec<AccountCard> = accounts
            .into_iter()
            .map(|account| {
                let mut rows = Vec::new();
                if account.is_api_key_auth() {
                    rows = build_codex_api_key_usage_rows(lang, &account);
                } else if let Some(quota) = account.quota.as_ref() {
                    let has_presence_flags = quota.hourly_window_present.is_some()
                        || quota.weekly_window_present.is_some();
                    if !has_presence_flags || quota.hourly_window_present == Some(true) {
                        let percentage = quota.hourly_percentage.clamp(0, 100);
                        rows.push(make_progress_row(
                            format_codex_quota_metric_label(quota.hourly_window_minutes, "5h"),
                            format!("{percentage}%"),
                            percentage,
                            format_reset_subtext(lang, quota.hourly_reset_time),
                            codex_remaining_tone(percentage),
                        ));
                    }
                    if !has_presence_flags || quota.weekly_window_present == Some(true) {
                        let percentage = quota.weekly_percentage.clamp(0, 100);
                        rows.push(make_progress_row(
                            format_codex_quota_metric_label(quota.weekly_window_minutes, "Weekly"),
                            format!("{percentage}%"),
                            percentage,
                            format_reset_subtext(lang, quota.weekly_reset_time),
                            codex_remaining_tone(percentage),
                        ));
                    }
                    if let Some(mut code_review) = parse_code_review_metric(Some(quota)) {
                        code_review.label = "Code Review".to_string();
                        code_review.subtext = quota
                            .raw_data
                            .as_ref()
                            .and_then(|raw| raw.get("code_review_rate_limit"))
                            .and_then(|rate_limit| {
                                rate_limit
                                    .get("primary_window")
                                    .or_else(|| rate_limit.get("secondary_window"))
                            })
                            .and_then(|window| {
                                window
                                    .get("reset_at")
                                    .and_then(parse_json_number)
                                    .map(|value| value.floor() as i64)
                                    .or_else(|| {
                                        window
                                            .get("reset_after_seconds")
                                            .and_then(parse_json_number)
                                            .map(|value| {
                                                chrono::Utc::now().timestamp()
                                                    + value.floor() as i64
                                            })
                                    })
                            })
                            .and_then(|ts| format_reset_subtext(lang, Some(ts)));
                        rows.push(code_review);
                    }
                }
                let remaining_percent = min_quota_progress(&rows, !account.is_api_key_auth());
                let title = account.display_name(&modules::i18n::translate(
                    lang,
                    "common.apiKeyAccount",
                    &[],
                ));
                AccountCard {
                    id: account.id,
                    title,
                    plan: account.plan_type,
                    updated_at: display_updated_at(
                        account.usage_updated_at,
                        account.last_used,
                        account.created_at,
                    ),
                    quota_rows: rows,
                    remaining_percent,
                }
            })
            .collect();

        // 有 API 服务账号池或当前正是 API 服务时，插入虚拟卡片展示池额度。
        if api_service_current || modules::codex_local_access::api_service_collection_has_accounts()
        {
            cards.insert(0, build_codex_api_service_card(lang));
        }

        (cards, current_id, recommended)
    }
