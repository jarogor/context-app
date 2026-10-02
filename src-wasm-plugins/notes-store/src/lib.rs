//! Базовый плагин наборов заметок приложения «Текстура».
//!
//! Владеет наборами заметок к книгам, хранит их в служебном состоянии плагина и
//! публикует событие `notes:changed` при изменении наборов или заметок.
//! Экспортирует функцию `invoke` по контракту приложения. Модель заметки для ядра
//! непрозрачна: набор адресуется ключом книги, заметка — непрозрачным якорем.

pub mod host;
pub mod models;
pub mod store;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde::Deserialize;
use serde_json::json;
use std::sync::atomic::{AtomicU32, Ordering};

use crate::host::Host;
use crate::models::{NoteInput, NotePatch, NoteSet};
use crate::store::NotesState;

/// Ключ служебного состояния с наборами заметок.
const STATE_KEY: &str = "notes.json";

/// Префикс идентификатора набора.
const SET_ID_PREFIX: &str = "ns";

/// Префикс идентификатора заметки.
const NOTE_ID_PREFIX: &str = "note";

/// Счётчик для уникальности идентификаторов в пределах запуска.
static SEQUENCE: AtomicU32 = AtomicU32::new(0);

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
struct Request {
    /// Действие плагина заметок.
    action: String,
    /// Данные операции.
    #[serde(default)]
    payload: serde_json::Value,
}

/// Диспетчеризация действий плагина заметок.
pub fn handle(host: &impl Host, input: &str) -> Result<String, String> {
    let request: Request = serde_json::from_str(input).map_err(|error| error.to_string())?;
    match request.action.as_str() {
        "list_sets" => list_sets(host, &request.payload),
        "get_set" => get_set(host, &request.payload),
        "create_set" => create_set(host, &request.payload),
        "rename_set" => rename_set(host, &request.payload),
        "delete_set" => delete_set(host, &request.payload),
        "set_active" => set_active(host, &request.payload),
        "add_note" => add_note(host, &request.payload),
        "update_note" => update_note(host, &request.payload),
        "delete_note" => delete_note(host, &request.payload),
        other => Err(format!("неизвестное действие плагина заметок: {other}")),
    }
}

/// Список наборов книги с идентификатором, именем, числом заметок и активным набором.
fn list_sets(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let book_key = string_field(payload, "book_key");
    let state = load(host)?;
    let active = state.active_for_book(&book_key).map(str::to_string);
    Ok(json!({ "sets": state.list_for_book(&book_key), "active_set_id": active }).to_string())
}

/// Набор целиком со всеми заметками.
fn get_set(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let set_id = set_id(payload);
    let state = load(host)?;
    let set = state
        .find(&set_id)
        .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?
        .clone();
    Ok(set_response(&set))
}

/// Создание набора для книги и публикация события.
fn create_set(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let book_key = string_field(payload, "book_key");
    let name = string_field(payload, "name");
    let now = host.now_millis();
    let id = new_id(SET_ID_PREFIX, now);
    let mut state = load(host)?;
    let set = state.create_set(&book_key, &name, &id, now)?;
    save(host, &state)?;
    emit_changed(host, &set.book_key, &set.id)?;
    Ok(set_response(&set))
}

/// Переименование набора и публикация события.
fn rename_set(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let set_id = set_id(payload);
    let name = string_field(payload, "name");
    let mut state = load(host)?;
    let set = state.rename_set(&set_id, &name)?;
    save(host, &state)?;
    emit_changed(host, &set.book_key, &set.id)?;
    Ok(set_response(&set))
}

/// Удаление набора вместе с заметками и публикация события.
fn delete_set(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let set_id = set_id(payload);
    let mut state = load(host)?;
    let book_key = state
        .find(&set_id)
        .map(|set| set.book_key.clone())
        .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
    state.delete_set(&set_id)?;
    save(host, &state)?;
    emit_changed(host, &book_key, &set_id)?;
    Ok(json!({ "ok": true }).to_string())
}

/// Запоминание активного набора книги без публикации события.
///
/// Выбор набора — состояние клиента: он не меняет наборы и заметки, поэтому
/// событие `notes:changed` не публикуется, чтобы не перечитывать заметки.
fn set_active(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let book_key = string_field(payload, "book_key");
    let set_id = set_id(payload);
    let mut state = load(host)?;
    state.set_active(&book_key, &set_id)?;
    save(host, &state)?;
    Ok(json!({ "ok": true }).to_string())
}

/// Добавление заметки в набор и публикация события.
fn add_note(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let set_id = set_id(payload);
    let input: NoteInput = payload
        .get("note")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("некорректная заметка: {error}"))?
        .unwrap_or_default();
    let now = host.now_millis();
    let note_id = new_id(NOTE_ID_PREFIX, now);
    let mut state = load(host)?;
    let note = state.add_note(&set_id, input, &note_id, now)?;
    save(host, &state)?;
    let set = current_set(&state, &set_id)?;
    emit_changed(host, &set.book_key, &set_id)?;
    Ok(json!({ "note": note, "set": set }).to_string())
}

/// Изменение заметки и публикация события.
fn update_note(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let set_id = set_id(payload);
    let note_id = string_field(payload, "note_id");
    let patch: NotePatch = payload
        .get("patch")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("некорректное изменение заметки: {error}"))?
        .unwrap_or_default();
    let now = host.now_millis();
    let mut state = load(host)?;
    let note = state.update_note(&set_id, &note_id, patch, now)?;
    save(host, &state)?;
    let set = current_set(&state, &set_id)?;
    emit_changed(host, &set.book_key, &set_id)?;
    Ok(json!({ "note": note, "set": set }).to_string())
}

/// Удаление заметки из набора и публикация события.
fn delete_note(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let set_id = set_id(payload);
    let note_id = string_field(payload, "note_id");
    let mut state = load(host)?;
    state.delete_note(&set_id, &note_id)?;
    save(host, &state)?;
    let set = current_set(&state, &set_id)?;
    emit_changed(host, &set.book_key, &set_id)?;
    Ok(json!({ "set": set }).to_string())
}

/// Текущий набор состояния или отказ, если он исчез.
fn current_set(state: &NotesState, set_id: &str) -> Result<NoteSet, String> {
    state
        .find(set_id)
        .cloned()
        .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))
}

/// Ответ с набором целиком.
fn set_response(set: &NoteSet) -> String {
    json!({ "set": set }).to_string()
}

/// Публикация события об изменении с книгой и набором.
fn emit_changed(host: &impl Host, book_key: &str, set_id: &str) -> Result<(), String> {
    let payload = json!({ "book_key": book_key, "set_id": set_id }).to_string();
    host.emit_event("notes:changed", &payload)
}

/// Новый уникальный идентификатор по префиксу и времени.
fn new_id(prefix: &str, now_millis: i64) -> String {
    let sequence = SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("{prefix}-{:x}-{:x}", now_millis.max(0) as u64, sequence)
}

/// Извлечение идентификатора набора из payload.
fn set_id(payload: &serde_json::Value) -> String {
    string_field(payload, "set_id")
}

/// Извлечение строкового поля payload.
fn string_field(payload: &serde_json::Value, key: &str) -> String {
    payload
        .get(key)
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string()
}

/// Загрузка состояния из служебного хранилища с нормализацией.
fn load(host: &impl Host) -> Result<NotesState, String> {
    let Some(value) = host.state_read(STATE_KEY)? else {
        return Ok(NotesState::new());
    };
    let state: NotesState = serde_json::from_str(&value).map_err(|error| error.to_string())?;
    Ok(state.normalized())
}

/// Сохранение состояния в служебное хранилище.
fn save(host: &impl Host, state: &NotesState) -> Result<(), String> {
    let value = serde_json::to_string(state).map_err(|error| error.to_string())?;
    host.state_write(STATE_KEY, &value)
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
