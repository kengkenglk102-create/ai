use std::collections::HashMap;

use serde_json::Value;

static LOCALES: std::sync::LazyLock<HashMap<&'static str, Value>> =
    std::sync::LazyLock::new(|| {
        let locale_files = [
            ("en", include_str!("../../../src/locales/en.json")),
            ("en-us", include_str!("../../../src/locales/en.json")),
            ("vi", include_str!("../../../src/locales/vi.json")),
            ("vi-vn", include_str!("../../../src/locales/vi.json")),
        ];

        locale_files
            .into_iter()
            .map(|(locale, content)| {
                let parsed = serde_json::from_str::<Value>(content)
                    .unwrap_or_else(|err| panic!("Lỗi phân tích file ngôn ngữ {}: {}", locale, err));
                (locale, parsed)
            })
            .collect()
    });

fn normalize_locale(locale: &str) -> String {
    locale.trim().replace('_', "-").to_lowercase()
}

fn locale_candidates(locale: &str) -> Vec<String> {
    let normalized = normalize_locale(locale);
    if normalized.is_empty() {
        return vec!["vi".to_string(), "en".to_string()];
    }

    let mut candidates = vec![normalized.clone()];

    if normalized == "vi" || normalized.starts_with("vi-") {
        if !candidates.iter().any(|item| item == "vi") {
            candidates.push("vi".to_string());
        }
    }

    if !candidates.iter().any(|item| item == "vi") {
        candidates.push("vi".to_string());
    }
    if !candidates.iter().any(|item| item == "en") {
        candidates.push("en".to_string());
    }

    candidates
}

fn lookup_key<'a>(value: &'a Value, key: &str) -> Option<&'a str> {
    let mut current = value;
    for segment in key.split('.') {
        current = current.get(segment)?;
    }
    current.as_str()
}

pub fn translate(locale: &str, key: &str, replacements: &[(&str, &str)]) -> String {
    let template = locale_candidates(locale)
        .into_iter()
        .find_map(|candidate| {
            LOCALES
                .get(candidate.as_str())
                .and_then(|value| lookup_key(value, key))
        })
        .unwrap_or(key);

    let mut output = template.to_string();
    for (name, value) in replacements {
        output = output.replace(&format!("{{{{{}}}}}", name), value);
    }
    output
}

#[cfg(test)]
mod tests {
    use super::translate;

    #[test]
    fn uses_selected_locale() {
        assert_eq!(
            translate("vi", "quotaAlert.modal.title", &[]),
            "Cảnh báo hạn mức"
        );
        assert_eq!(
            translate("en-us", "quotaAlert.modal.title", &[]),
            "Quota Alert"
        );
    }

    #[test]
    fn falls_back_to_base_locale() {
        assert_eq!(
            translate("en-gb", "quotaAlert.modal.title", &[]),
            "Quota Alert"
        );
        assert_eq!(
            translate("vi-vn", "quotaAlert.modal.title", &[]),
            "Cảnh báo hạn mức"
        );
    }

    #[test]
    fn interpolates_placeholders() {
        let text = translate(
            "en-us",
            "quotaAlert.bannerText",
            &[
                ("email", "demo@example.com"),
                ("threshold", "20"),
                ("lowest", "12"),
                ("models", "claude-sonnet-4"),
            ],
        );

        assert_eq!(
            text,
            "Quota alert for demo@example.com (threshold 20%, lowest 12%, models: claude-sonnet-4)"
        );
    }
}
