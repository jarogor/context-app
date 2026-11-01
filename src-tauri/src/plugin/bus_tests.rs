use super::*;

/// Публикация и извлечение события.
#[test]
fn publish_and_drain_event() {
    let bus = EventBus::new();
    assert!(bus.is_empty());
    bus.publish(PluginEvent {
        level: "user".to_string(),
        severity: Severity::Info,
        message: "привет".to_string(),
        source: "test".to_string(),
        details: serde_json::json!({ "key": "value" }),
    });
    let events = bus.drain();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].level, "user");
    assert_eq!(events[0].severity, Severity::Info);
    assert_eq!(events[0].message, "привет");
    assert!(bus.is_empty(), "после извлечения буфер пуст");
}

/// Порядок событий сохраняется.
#[test]
fn preserves_order() {
    let bus = EventBus::new();
    for index in 0..3 {
        bus.publish(PluginEvent {
            level: "technical".to_string(),
            severity: Severity::Info,
            message: format!("event-{index}"),
            source: "test".to_string(),
            details: serde_json::json!({}),
        });
    }
    let messages: Vec<String> = bus.drain().into_iter().map(|event| event.message).collect();
    assert_eq!(messages, ["event-0", "event-1", "event-2"]);
}

/// Повторное извлечение пустого буфера не даёт событий.
#[test]
fn drain_empty_bus() {
    let bus = EventBus::new();
    assert!(bus.drain().is_empty());
    assert!(bus.is_empty());
}

/// Событие сериализуется в JSON и обратно.
#[test]
fn event_round_trip() {
    let event = PluginEvent {
        level: "technical".to_string(),
        severity: Severity::Warn,
        message: "ok".to_string(),
        source: "plugin".to_string(),
        details: serde_json::json!({ "a": 1 }),
    };
    let json = serde_json::to_string(&event).expect("сериализация");
    let restored: PluginEvent = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(event, restored);
}

/// Степень разбирается из строки независимо от регистра.
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

/// Технические события не попадают в ленту уведомлений.
///
/// Они пишутся в файл диагностики: пользователю строка «Плагин загружен» ничего
/// не объясняет, а поддержке нужен весь журнал, а не отдельные записи в ленте.
#[test]
fn publish_technical_does_not_reach_user_journal() {
    let bus = EventBus::new();
    set_log_level(Severity::Info);
    bus.publish_technical(Severity::Info, "инфо", "test", serde_json::json!({}));
    bus.publish_technical(Severity::Trace, "трасса", "test", serde_json::json!({}));
    assert!(
        bus.drain().is_empty(),
        "технические события не публикуются в ленту"
    );
    set_log_level(Severity::Info);
}

/// Пользовательские события публикуются независимо от порога.
#[test]
fn publish_user_ignores_threshold() {
    let bus = EventBus::new();
    set_log_level(Severity::Error);
    bus.publish_user(
        Severity::Info,
        "пользовательское",
        "test",
        serde_json::json!({}),
    );
    let messages: Vec<String> = bus.drain().into_iter().map(|event| event.message).collect();
    assert_eq!(messages, ["пользовательское"]);
    set_log_level(Severity::Info);
}
