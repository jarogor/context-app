//! WASM-точка входа базового плагина заметок.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! привилегированную host-функцию импорта, берёт общую host-обвязку из
//! `host-sdk` и экспортирует функцию `invoke` по контракту.

use base64::Engine;
use extism_pdk::{host_fn, plugin_fn, FnResult};
use host_sdk::wasm::HostEnv as BaseHostEnv;
use host_sdk::Host;

/// Привилегированные host-функции, доступные плагину заметок.
#[host_fn]
extern "ExtismHost" {
    /// Чтение выбранного пользователем файла в base64.
    fn import_read_bytes(path: String) -> String;
}

/// Реализация [`Host`] поверх host-функций приложения.
///
/// Общие операции (`state_read`/`state_write`/`emit_event`/`now_millis`)
/// делегируются [`BaseHostEnv`], привилегированное чтение файла импорта
/// объявлено локально.
struct NotesHostEnv;

impl Host for NotesHostEnv {
    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        BaseHostEnv.state_read(key)
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        BaseHostEnv.state_write(key, value)
    }

    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String> {
        BaseHostEnv.emit_event(name, payload)
    }

    fn now_millis(&self) -> i64 {
        BaseHostEnv.now_millis()
    }

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let encoded =
            unsafe { import_read_bytes(path.to_string()) }.map_err(|error| error.to_string())?;
        base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| error.to_string())
    }
}

/// Точка расширения: диспетчеризация действий плагина заметок.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let output = crate::handle(&NotesHostEnv, &input).map_err(extism_pdk::Error::msg)?;
    Ok(output)
}
