//! Тесты правил перезагрузки состояния после операций базовых плагинов.
//!
//! Набор активности плагинов и порог логирования читаются с диска и ходят в
//! WASM, поэтому перезагружать их нужно только после операций, которые их
//! действительно могут изменить. Иначе каждое сохранение настроек задерживало
//! отклик интерфейса.

use super::capability_changes_activation;
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
