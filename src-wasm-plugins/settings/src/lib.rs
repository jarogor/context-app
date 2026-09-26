//! Базовый плагин настроек приложения «Текстура» и её плагинов.
//!
//! Владеет реестром секций настроек и их значениями, хранит состояние в
//! служебном состоянии плагина и публикует событие `settings:changed` при
//! сохранении значений. Экспортирует функцию `invoke` по контракту приложения.

pub mod host;
pub mod models;
pub mod registry;
pub mod store;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde::Deserialize;
use serde_json::json;

use crate::host::Host;
use crate::models::Source;
use crate::registry::Registry;
use crate::store::SettingsState;

/// Ключ служебного состояния с реестром и значениями настроек.
const STATE_KEY: &str = "settings.json";

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
struct Request {
    /// Действие плагина настроек.
    action: String,
    /// Данные операции.
    #[serde(default)]
    payload: serde_json::Value,
}

/// Диспетчеризация действий плагина настроек.
pub fn handle(host: &impl Host, input: &str) -> Result<String, String> {
    let request: Request = serde_json::from_str(input).map_err(|error| error.to_string())?;
    match request.action.as_str() {
        "register" => register(host, &request.payload),
        "list" => list(host),
        "get" => get(host, &request.payload),
        "set" => set(host, &request.payload),
        other => Err(format!("неизвестное действие плагина настроек: {other}")),
    }
}

/// Регистрация деклараций настроек и замена реестра.
fn register(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let sources: Vec<Source> = payload
        .get("sources")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("некорректные декларации настроек: {error}"))?
        .unwrap_or_default();
    let registry = Registry::from_sources(&sources)?;
    let mut state = load(host)?;
    state.set_registry(&registry);
    save(host, &state)?;
    Ok(json!({ "sections": state.sections_with_values() }).to_string())
}

/// Список секций с текущими значениями.
fn list(host: &impl Host) -> Result<String, String> {
    let state = load(host)?;
    Ok(json!({ "sections": state.sections_with_values() }).to_string())
}

/// Значения конкретной секции.
fn get(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = section_id(payload);
    let state = load(host)?;
    let values = state
        .values_for(&id)
        .ok_or_else(|| format!("неизвестная секция настроек: {id}"))?;
    Ok(json!({ "values": values }).to_string())
}

/// Сохранение значений секции и публикация события об изменении.
fn set(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = section_id(payload);
    let values = payload.get("values").cloned().unwrap_or_else(|| json!({}));
    let mut state = load(host)?;
    let merged = state.set_values(&id, &values)?;
    save(host, &state)?;

    let event = json!({ "section": id, "values": merged }).to_string();
    host.emit_event("settings:changed", &event)?;
    Ok(json!({ "values": merged }).to_string())
}

/// Извлечение полного идентификатора секции из payload.
fn section_id(payload: &serde_json::Value) -> String {
    payload
        .get("section")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Загрузка состояния из служебного хранилища.
fn load(host: &impl Host) -> Result<SettingsState, String> {
    let Some(value) = host.state_read(STATE_KEY)? else {
        return Ok(SettingsState::new());
    };
    serde_json::from_str(&value).map_err(|error| error.to_string())
}

/// Сохранение состояния в служебное хранилище.
fn save(host: &impl Host, state: &SettingsState) -> Result<(), String> {
    let value = serde_json::to_string(state).map_err(|error| error.to_string())?;
    host.state_write(STATE_KEY, &value)
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
