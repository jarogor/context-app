use super::*;

/// Публикация и извлечение события.
#[test]
fn publish_and_drain_event() {
    let bus = EventBus::new();
    assert!(bus.is_empty());
    bus.publish(PluginEvent {
        level: "user".to_string(),
        message: "привет".to_string(),
        source: "test".to_string(),
        details: serde_json::json!({ "key": "value" }),
    });
    let events = bus.drain();
    assert_eq!(events.len(), 1);
    assert_eq!(events[0].level, "user");
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
        message: "ok".to_string(),
        source: "plugin".to_string(),
        details: serde_json::json!({ "a": 1 }),
    };
    let json = serde_json::to_string(&event).expect("сериализация");
    let restored: PluginEvent = serde_json::from_str(&json).expect("десериализация");
    assert_eq!(event, restored);
}
