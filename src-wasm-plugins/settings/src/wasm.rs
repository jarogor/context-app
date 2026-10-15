//! WASM-точка входа базового плагина настроек.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: берёт общую
//! host-обвязку из `host-sdk` и экспортирует функцию `invoke` по контракту.

use extism_pdk::{plugin_fn, FnResult};
use host_sdk::wasm::HostEnv;

/// Точка расширения: диспетчеризация действий плагина настроек.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let output = crate::handle(&HostEnv, &input).map_err(extism_pdk::Error::msg)?;
    Ok(output)
}
