//! WASM-точка входа плагина формата чтения FB2.
//!
//! Модуль собирается только под `wasm32`: объявляет host-функции приложения и
//! экспортируемую функцию `invoke` по контракту.

use extism_pdk::{host_fn, plugin_fn, FnResult};
use serde_json::json;

use crate::handle;

/// Host-функции ядра, доступные плагину формата.
#[host_fn]
extern "ExtismHost" {
    /// Чтение байтов файла книги в base64.
    fn fs_read_bytes(path: String) -> String;
    /// Текущее время Unix в миллисекундах (строка с числом).
    fn now_millis() -> String;
}

/// Декодирование base64 в байты.
fn decode_base64(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;
    base64::engine::general_purpose::STANDARD
        .decode(value.as_bytes())
        .map_err(|error| error.to_string())
}

/// Точка расширения: диспетчеризация действий плагина.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let request: serde_json::Value = serde_json::from_str(&input)?;
    let action = request
        .get("action")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let payload = request.get("payload").cloned().unwrap_or_else(|| json!({}));
    let path = payload
        .get("path")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    if path.is_empty() {
        return Err(extism_pdk::Error::msg("не указан путь к книге").into());
    }
    let encoded = unsafe { fs_read_bytes(path.to_string()) }
        .map_err(|error| extism_pdk::Error::msg(error.to_string()))?;
    let bytes = decode_base64(&encoded).map_err(extism_pdk::Error::msg)?;
    let output = handle(action, path, &bytes).map_err(extism_pdk::Error::msg)?;
    Ok(output)
}
