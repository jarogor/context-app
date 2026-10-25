//! Тесты правил перезагрузки состояния после операций базовых плагинов.
//!
//! Набор активности плагинов и порог логирования читаются с диска и ходят в
//! WASM, поэтому перезагружать их нужно только после операций, которые их
//! действительно могут изменить. Иначе каждое сохранение настроек задерживало
//! отклик интерфейса.

use super::{capability_changes_activation, payload_changes_log_level};
use crate::plugin::contract::{CAPABILITY_PLUGIN_STORE, CAPABILITY_SETTINGS};

#[test]
fn активность_перезагружается_только_после_сторовой_операции() {
    assert!(capability_changes_activation(
        CAPABILITY_PLUGIN_STORE,
        "set_enabled"
    ));
    // Чтение каталога активность не меняет.
    assert!(!capability_changes_activation(
        CAPABILITY_PLUGIN_STORE,
        "catalog"
    ));
    // Настройки активностью не управляют.
    assert!(!capability_changes_activation(CAPABILITY_SETTINGS, "save"));
    assert!(!capability_changes_activation(CAPABILITY_SETTINGS, "set"));
}

#[test]
fn порог_логирования_перезапрашивается_только_при_его_изменении() {
    use serde_json::json;

    // Сохранение темы, палитры или другого поля порог не трогает: перечитывать
    // его из WASM под общим замком состояния незачем — это задерживало закрытие
    // раздела настроек.
    assert!(!payload_changes_log_level(&json!({
        "sections": [{ "section": "app.general", "values": { "appearance.theme": "dark" } }]
    })));
    assert!(!payload_changes_log_level(&json!({
        "section": "app.general",
        "values": { "appearance.palette": "cobalt" }
    })));
    assert!(!payload_changes_log_level(&json!({ "sections": [] })));

    // Смена порога — перезапрашиваем, иначе новый уровень не применится.
    assert!(payload_changes_log_level(&json!({
        "sections": [
            { "section": "app.general", "values": { "diagnostics.log_level": "trace" } }
        ]
    })));
    assert!(payload_changes_log_level(&json!({
        "values": { "diagnostics.log_level": "warn" }
    })));
}
