//! WASM-точка входа базового плагина стора.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! host-функции приложения и экспортируемую функцию `invoke` по контракту.

use base64::Engine;
use extism_pdk::{host_fn, plugin_fn, FnResult};

use crate::host::Host;
use crate::models::{Installed, PluginEntry};

/// Host-функции, доступные плагину стора.
#[host_fn]
extern "ExtismHost" {
    /// Чтение служебного состояния по ключу.
    fn state_read(key: String) -> String;
    /// Запись служебного состояния по ключу.
    fn state_write(key: String, value: String) -> String;
    /// Публикация именованного прикладного события.
    fn emit_event(name: String, payload: String) -> String;
    /// Чтение выбранного пользователем файла в base64.
    fn import_read_bytes(path: String) -> String;
    /// Инспекция пакета плагина без установки.
    fn store_inspect(path: String) -> String;
    /// Установка пакета плагина.
    fn store_install(path: String) -> String;
    /// Удаление установленного плагина.
    fn store_uninstall(name: String) -> String;
    /// Список установленных плагинов.
    fn store_installed() -> String;
    /// Перечень отключаемых плагинов.
    fn store_plugins() -> String;
    /// Переключение активности плагина.
    fn store_set_enabled(name: String, enabled: String) -> String;
}

/// Реализация `Host` поверх host-функций приложения.
struct HostEnv;

impl Host for HostEnv {
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

    fn store_uninstall(&self, name: &str) -> Result<(), String> {
        unsafe { store_uninstall(name.to_string()) }
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

    fn store_set_enabled(&self, name: &str, enabled: bool) -> Result<(), String> {
        unsafe { store_set_enabled(name.to_string(), enabled.to_string()) }
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

    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        let value = unsafe { state_read(key.to_string()) }.map_err(|error| error.to_string())?;
        if value.is_empty() {
            Ok(None)
        } else {
            Ok(Some(value))
        }
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        unsafe { state_write(key.to_string(), value.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String> {
        unsafe { emit_event(name.to_string(), payload.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

/// Точка расширения: диспетчеризация действий плагина стора.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let output = crate::handle(&HostEnv, &input).map_err(extism_pdk::Error::msg)?;
    Ok(output)
}
