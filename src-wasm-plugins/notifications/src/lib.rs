//! Базовый плагин уведомлений и технических логов приложения «Текстура».
//!
//! Владеет журналом событий, хранит его в служебном состоянии плагина и
//! публикует событие `notifications:added` при добавлении записи. Экспортирует
//! функцию `invoke` по контракту приложения.

pub mod host;
pub mod journal;
pub mod models;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde::Deserialize;
use serde_json::json;

use crate::host::Host;
use crate::journal::Journal;
use crate::models::{Level, Severity};

/// Ключ служебного состояния с журналом.
const STATE_KEY: &str = "journal.json";

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
struct Request {
    /// Действие плагина уведомлений.
    action: String,
    /// Данные операции.
    #[serde(default)]
    payload: serde_json::Value,
}

/// Диспетчеризация действий плагина уведомлений.
pub fn handle(host: &impl Host, input: &str) -> Result<String, String> {
    let request: Request = serde_json::from_str(input).map_err(|error| error.to_string())?;
    match request.action.as_str() {
        "publish" => publish(host, &request.payload),
        "list" => list(host, &request.payload),
        "mark_read" => mark_read(host, &request.payload),
        "mark_all_read" => {
            let mut journal = load(host)?;
            journal.mark_all_read();
            save(host, &journal)?;
            Ok(json!({ "ok": true }).to_string())
        }
        "clear" => {
            let mut journal = load(host)?;
            journal.clear();
            save(host, &journal)?;
            Ok(json!({ "ok": true }).to_string())
        }
        other => Err(format!("неизвестное действие плагина: {other}")),
    }
}

/// Добавление записи и публикация события.
fn publish(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let level = payload
        .get("level")
        .and_then(|value| value.as_str())
        .unwrap_or("user");
    let message = payload
        .get("message")
        .and_then(|value| value.as_str())
        .unwrap_or_default();
    let source = payload
        .get("source")
        .and_then(|value| value.as_str())
        .unwrap_or("plugin");
    let severity = payload
        .get("severity")
        .and_then(|value| value.as_str())
        .and_then(Severity::parse)
        .unwrap_or(Severity::Info);
    let details = payload.get("details").cloned().unwrap_or_else(|| json!({}));

    let timestamp = host.now_millis();
    let mut journal = load(host)?;
    let entry = if level == "user" {
        journal.add_user(timestamp, message, severity, source, details)
    } else {
        journal.add_technical(timestamp, message, severity, source, details)
    };
    save(host, &journal)?;

    let serialized = serde_json::to_string(&entry).map_err(|error| error.to_string())?;
    host.emit_event("notifications:added", &serialized)?;
    Ok(serialized)
}

/// Список записей с опциональным фильтром уровня.
fn list(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let level = match payload.get("level").and_then(|value| value.as_str()) {
        Some("User") => Some(Level::User),
        Some("Technical") => Some(Level::Technical),
        _ => None,
    };
    let journal = load(host)?;
    let entries = journal.list(level);
    serde_json::to_string(&json!({ "entries": entries })).map_err(|error| error.to_string())
}

/// Пометка выбранных записей прочитанными.
fn mark_read(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let ids: Vec<u64> = payload
        .get("ids")
        .and_then(|value| serde_json::from_value(value.clone()).ok())
        .unwrap_or_default();
    let mut journal = load(host)?;
    journal.mark_read(&ids);
    save(host, &journal)?;
    Ok(json!({ "ok": true }).to_string())
}

/// Загрузка журнала из служебного состояния.
fn load(host: &impl Host) -> Result<Journal, String> {
    let Some(value) = host.state_read(STATE_KEY)? else {
        return Ok(Journal::new());
    };
    serde_json::from_str(&value).map_err(|error| error.to_string())
}

/// Сохранение журнала в служебное состояние.
fn save(host: &impl Host, journal: &Journal) -> Result<(), String> {
    let value = serde_json::to_string(journal).map_err(|error| error.to_string())?;
    host.state_write(STATE_KEY, &value)
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
