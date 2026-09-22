//! WASM-точка входа базового плагина уведомлений.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! host-функции приложения и экспортируемую функцию `invoke` по контракту.

use crate::host::Host;
use extism_pdk::{host_fn, plugin_fn, FnResult};

/// Host-функция чтения служебного состояния.
#[host_fn]
extern "ExtismHost" {
    /// Чтение служебного состояния по ключу.
    fn state_read(key: String) -> String;
    /// Запись служебного состояния по ключу.
    fn state_write(key: String, value: String) -> String;
    /// Публикация именованного прикладного события.
    fn emit_event(name: String, payload: String) -> String;
}

/// Реализация `Host` поверх host-функций приложения.
struct HostEnv;

impl Host for HostEnv {
    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        let value = unsafe { state_read(key.to_string()).map_err(|error| error.to_string())? };
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

/// Точка расширения: диспетчеризация действий плагина уведомлений.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let output = crate::handle(&HostEnv, &input).map_err(extism_pdk::Error::msg)?;
    Ok(output)
}
