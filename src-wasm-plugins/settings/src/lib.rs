//! Базовый плагин настроек приложения «Текстура» и её плагинов.
//!
//! Владеет реестром секций настроек и их значениями, хранит состояние в
//! служебном состоянии плагина и публикует событие `settings:changed` при
//! сохранении значений. Экспортирует функцию `invoke` по контракту приложения.

pub mod coerce;
pub mod models;
pub mod registry;
pub mod store;
pub mod ui;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde_json::json;

use host_sdk::state;
use host_sdk::{Host, Request};

use crate::models::Source;
use crate::registry::Registry;
use crate::store::SettingsState;

/// Ключ служебного состояния с реестром и значениями настроек.
const STATE_KEY: &str = "settings.json";

/// Диспетчеризация действий плагина настроек.
pub fn handle(host: &impl Host, input: &str) -> Result<String, String> {
    let request = Request::parse(input)?;
    match request.action.as_str() {
        "register" => register(host, &request.payload),
        "list" => list(host),
        "get" => get(host, &request.payload),
        "set" => set(host, &request.payload),
        "save" => save_sections(host, &request.payload),
        "ui" => ui(host),
        "intent" => intent(host, &request.payload),
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

/// Сохранение значений нескольких секций одним неделимым действием.
///
/// Значения всех переданных секций проверяются приведением к типам полей, и
/// только при успехе записываются все секции разом; при ошибке в любой секции не
/// изменяется ни одна. По каждой записанной секции публикуется `settings:changed`.
fn save_sections(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let records = payload
        .get("sections")
        .and_then(serde_json::Value::as_array)
        .cloned()
        .unwrap_or_default();
    if records.is_empty() {
        return Err("список секций для сохранения пуст".to_string());
    }

    let mut state = load(host)?;
    // Проверка всех секций до записи: сохранение неделимо.
    let mut prepared: Vec<(String, serde_json::Value)> = Vec::new();
    for record in &records {
        let id = section_id(record);
        let values = record.get("values").cloned().unwrap_or_else(|| json!({}));
        let Some(section) = state.find(&id).cloned() else {
            return Err(format!("неизвестная секция настроек: {id}"));
        };
        let coerced = crate::coerce::coerce_values(&section.fields, &values)?;
        prepared.push((id, coerced));
    }

    for (id, values) in &prepared {
        state.set_values(id, values)?;
    }
    save(host, &state)?;

    for (id, _) in &prepared {
        let merged = state.values_for(id).unwrap_or_else(|| json!({}));
        let event = json!({ "section": id, "values": merged }).to_string();
        host.emit_event("settings:changed", &event)?;
    }

    Ok(declarations_response(&state, None))
}

/// Декларации пространства `settings.section` для всех секций реестра.
fn ui(host: &impl Host) -> Result<String, String> {
    let state = load(host)?;
    Ok(declarations_response(&state, None))
}

/// Обработка интента интерфейса: применение действия и возврат свежих деклараций.
fn intent(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let space = payload
        .get("space")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    if space != ui_sdk::SPACE_SETTINGS_SECTION {
        return Err(format!("неизвестное пространство интерфейса: {space}"));
    }
    let id = payload
        .get("id")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let action = payload
        .get("action")
        .and_then(serde_json::Value::as_str)
        .unwrap_or_default();
    let values = payload.get("values").cloned().unwrap_or_else(|| json!({}));

    let mut state = load(host)?;
    let Some(section) = state.find(id).cloned() else {
        return Err(format!("неизвестная секция настроек: {id}"));
    };
    if action != ui::ACTION_SAVE {
        return Err(format!(
            "неизвестное действие интерфейса настроек: {action}"
        ));
    }
    let coerced = match crate::coerce::coerce_values(&section.fields, &values) {
        Ok(coerced) => coerced,
        Err(message) => return Ok(declarations_response(&state, Some(&message))),
    };
    state.set_values(id, &coerced)?;
    save(host, &state)?;

    let merged = state.values_for(id).unwrap_or_else(|| json!({}));
    let event = json!({ "section": id, "values": merged }).to_string();
    host.emit_event("settings:changed", &event)?;
    Ok(declarations_response(&state, None))
}

/// Сериализация ответа со всеми декларациями и необязательной ошибкой действия.
fn declarations_response(state: &SettingsState, error: Option<&str>) -> String {
    let declarations: Vec<ui_sdk::Declaration> = state
        .registry()
        .iter()
        .map(|section| {
            let values = state.values_for(&section.id).unwrap_or_else(|| json!({}));
            ui::section_declaration(section, &values)
        })
        .collect();
    let mut response = ui_sdk::Declaration::response(&declarations);
    if let (Some(message), Some(object)) = (error, response.as_object_mut()) {
        object.insert("error".to_string(), json!(message));
    }
    response.to_string()
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
    state::load::<SettingsState>(host, STATE_KEY)
}

/// Сохранение состояния в служебное хранилище.
fn save(host: &impl Host, state: &SettingsState) -> Result<(), String> {
    state::save(host, STATE_KEY, state)
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
