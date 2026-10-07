//! WASM-точка входа базового плагина стора.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! привилегированные host-функции стора, берёт общую host-обвязку из
//! `plugin-host` и экспортирует функцию `invoke` по контракту.

use base64::Engine;
use extism_pdk::{host_fn, plugin_fn, FnResult};
use plugin_host::wasm::HostEnv as BaseHostEnv;

use crate::host::Host;
use crate::models::{Installed, PluginEntry};

/// Привилегированные host-функции, доступные плагину стора.
#[host_fn]
extern "ExtismHost" {
    /// Чтение выбранного пользователем файла в base64.
    fn import_read_bytes(path: String) -> String;
    /// Инспекция пакета плагина без установки.
    fn store_inspect(path: String) -> String;
    /// Установка пакета плагина.
    fn store_install(path: String) -> String;
    /// Удаление установленного плагина.
    fn store_uninstall(id: String) -> String;
    /// Список установленных плагинов.
    fn store_installed() -> String;
    /// Перечень отключаемых плагинов.
    fn store_plugins() -> String;
    /// Переключение активности плагина.
    fn store_set_enabled(id: String, enabled: String) -> String;
}

/// Реализация `Host` поверх host-функций приложения.
///
/// Общие операции (`state_read`/`state_write`/`emit_event`) делегируются
/// [`BaseHostEnv`], привилегированные объявлены локально.
struct StoreHostEnv;

impl plugin_host::Host for StoreHostEnv {
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
}

impl Host for StoreHostEnv {
    fn store_inspect(&self, path: &str) -> Result<Installed, String> {
        let value =
            unsafe { store_inspect(path.to_string()) }.map_err(|error| error.to_string())?;
        serde_json::from_str(&value).map_err(|error| error.to_string())
    }

    fn store_install(&self, path: &str) -> Result<Installed, String> {
        let value =
            unsafe { store_install(path.to_string()) }.map_err(|error| error.to_string())?;
        serde_json::from_str(&value).map_err(|error| error.to_string())
    }

    fn store_uninstall(&self, id: &str) -> Result<(), String> {
        unsafe { store_uninstall(id.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn store_installed(&self) -> Result<Vec<Installed>, String> {
        let value = unsafe { store_installed() }.map_err(|error| error.to_string())?;
        serde_json::from_str(&value).map_err(|error| error.to_string())
    }

    fn store_plugins(&self) -> Result<Vec<PluginEntry>, String> {
        let value = unsafe { store_plugins() }.map_err(|error| error.to_string())?;
        serde_json::from_str(&value).map_err(|error| error.to_string())
    }

    fn store_set_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        unsafe { store_set_enabled(id.to_string(), enabled.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn read_file_text(&self, path: &str) -> Result<String, String> {
        let encoded =
            unsafe { import_read_bytes(path.to_string()) }.map_err(|error| error.to_string())?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(encoded)
            .map_err(|error| error.to_string())?;
        String::from_utf8(bytes).map_err(|error| error.to_string())
    }
}

/// Точка расширения: диспетчеризация действий плагина стора.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let output = crate::handle(&StoreHostEnv, &input).map_err(extism_pdk::Error::msg)?;
    Ok(output)
}
