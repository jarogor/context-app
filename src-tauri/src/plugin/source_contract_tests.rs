//! Совместимость протокола каталога: версия и отказ от более новой.

use super::{ensure_supported, SUPPORTED_SOURCE_PROTOCOL};

#[test]
fn accepts_supported_catalog_version() {
    let response = format!(
        r#"{{"catalog":{{"protocol_version":{SUPPORTED_SOURCE_PROTOCOL},"revision":1,"books":[]}}}}"#
    );
    assert!(ensure_supported(&response).is_ok());
}

#[test]
fn treats_answer_without_version_as_first_version() {
    // Прежний источник не сообщает версию: каталог читается как первая версия.
    assert!(ensure_supported(r#"{"catalog":{"books":[]}}"#).is_ok());
    assert!(ensure_supported(r#"{"ok":true}"#).is_ok());
}

#[test]
fn rejects_newer_catalog_version() {
    let response = format!(
        r#"{{"catalog":{{"protocol_version":{},"books":[]}}}}"#,
        SUPPORTED_SOURCE_PROTOCOL + 1
    );
    let error = ensure_supported(&response).expect_err("более новая версия");
    assert!(
        error.contains("более новой версией"),
        "ошибка объясняет причину: {error}"
    );
}

#[test]
fn reports_unreadable_answer() {
    assert!(ensure_supported("не json").is_err());
}
