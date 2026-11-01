//! Базовый плагин журнала уведомлений приложения «Контекст».
//!
//! Плагин ведёт журнал **пользовательских** событий: то, что пользователю
//! действительно стоит знать (книга не открылась, лимит вкладок превышен).
//! Техническая диагностика сюда не попадает: она пишется ядром в файл и нужна
//! поддержке, а не человеку. Так лента не засоряется непонятными ему записями.
//!
//! Хранит журнал в служебном состоянии плагина и публикует событие
//! `notifications:added` при добавлении записи. Экспортирует функцию `invoke`
//! по контракту приложения.

pub mod journal;
pub mod models;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde_json::json;

use host_sdk::state;
use host_sdk::{Host, Request};

use crate::journal::Journal;
use crate::models::Severity;

/// Ключ служебного состояния с журналом.
const STATE_KEY: &str = "journal.json";

/// Диспетчеризация действий плагина уведомлений.
pub fn handle(host: &impl Host, input: &str) -> Result<String, String> {
    let request = Request::parse(input)?;
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
    // Только пользовательский уровень: технический пишет ядро в файл.
    let entry = journal.add_user(timestamp, message, severity, source, details);
    save(host, &journal)?;

    let serialized = serde_json::to_string(&entry).map_err(|error| error.to_string())?;
    host.emit_event("notifications:added", &serialized)?;
    Ok(serialized)
}

/// Список записей с опциональным фильтром уровня.
fn list(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let journal = load(host)?;
    let entries = journal.list(None);
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
    state::load::<Journal>(host, STATE_KEY)
}

/// Сохранение журнала в служебное состояние.
fn save(host: &impl Host, journal: &Journal) -> Result<(), String> {
    state::save(host, STATE_KEY, journal)
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
