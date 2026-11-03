use super::*;
use std::path::{Path, PathBuf};

/// Направление журнала диагностики в каталог теста.
///
/// Журнал один на процесс, поэтому каждая проверка перед записью перенаправляет
/// его в свой каталог и возвращает путь к файлу.
fn setup_diagnostics(root: &Path) -> PathBuf {
    crate::plugin::diagnostics::init(root);
    root.join(crate::plugin::diagnostics::DIAGNOSTICS_FILE_NAME)
}

/// Публикация события пишет запись в журнал диагностики.
#[test]
fn publish_writes_diagnostics_record() {
    let root = crate::test_util::test_root("bus-publish");
    let journal = setup_diagnostics(&root);
    let bus = EventBus::new();

    bus.publish(
        Severity::Info,
        "привет",
        "test",
        serde_json::json!({ "key": "value" }),
    );

    let content = std::fs::read_to_string(&journal).expect("журнал диагностики");
    assert!(content.contains("привет"), "текст события: {content}");
    assert!(content.contains("[test]"), "источник события: {content}");
    assert!(
        content.contains("\"key\":\"value\""),
        "подробности события: {content}"
    );
    crate::test_util::cleanup(&root);
}

/// Порядок событий сохраняется.
#[test]
fn preserves_order() {
    let root = crate::test_util::test_root("bus-order");
    let journal = setup_diagnostics(&root);
    let bus = EventBus::new();

    for index in 0..3 {
        bus.publish(
            Severity::Info,
            format!("event-{index}"),
            "test",
            serde_json::json!({}),
        );
    }

    let content = std::fs::read_to_string(&journal).expect("журнал диагностики");
    let first = content.find("event-0").expect("первое событие");
    let second = content.find("event-1").expect("второе событие");
    let third = content.find("event-2").expect("третье событие");
    assert!(
        first < second && second < third,
        "порядок записей: {content}"
    );
    crate::test_util::cleanup(&root);
}

/// Степень серьёзности разбирается из строки независимо от регистра.
#[test]
fn parses_severity() {
    assert_eq!(Severity::parse("error"), Some(Severity::Error));
    assert_eq!(Severity::parse("WARN"), Some(Severity::Warn));
    assert_eq!(Severity::parse("Info"), Some(Severity::Info));
    assert_eq!(Severity::parse("debug"), Some(Severity::Debug));
    assert_eq!(Severity::parse("trace"), Some(Severity::Trace));
    assert_eq!(Severity::parse("unknown"), None);
}

/// Порог допускает событие не ниже себя по важности.
#[test]
fn threshold_allows_more_severe() {
    assert!(Severity::Error.allows(Severity::Info));
    assert!(Severity::Info.allows(Severity::Info));
    assert!(!Severity::Trace.allows(Severity::Info));
    assert!(!Severity::Debug.allows(Severity::Info));
}
