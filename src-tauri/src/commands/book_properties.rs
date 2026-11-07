//! Пользовательские свойства книг: чтение правок и запись правки.

use std::path::PathBuf;
use std::sync::Mutex;

use serde_json::{json, Value};
use tauri::State;

use crate::book_properties::{BookProperties, BookPropertyEntry};
use crate::plugin::AppState;

/// Чтение правок свойств всех книг.
///
/// Команда асинхронная: чтение файла не должно блокировать главный поток, пока
/// интерфейс ждёт готовности списка.
#[tauri::command]
pub async fn book_properties_get(state: State<'_, Mutex<AppState>>) -> Result<Value, String> {
    let root = app_state_root(&state)?;
    let properties = BookProperties::load(&root);
    serde_json::to_value(properties.books).map_err(|error| error.to_string())
}

/// Запись правки свойств книги; пустая правка удаляет запись.
#[tauri::command]
pub async fn book_properties_set(
    state: State<'_, Mutex<AppState>>,
    path: String,
    properties: Value,
) -> Result<Value, String> {
    let entry: BookPropertyEntry = serde_json::from_value(properties)
        .map_err(|error| format!("правка свойств книги не разбирается: {error}"))?;
    let root = app_state_root(&state)?;
    let mut store = BookProperties::load(&root);
    store.set(&path, entry);
    store.save(&root)?;
    // Другие области (список книг, панель свойств) узнают об изменении.
    crate::plugin::relay::emit("book-properties-changed", json!({ "path": path }));
    serde_json::to_value(store.books).map_err(|error| error.to_string())
}

/// Корень служебного каталога приложения.
fn app_state_root(state: &State<'_, Mutex<AppState>>) -> Result<PathBuf, String> {
    let state = crate::commands::lock_state(state.inner())?;
    Ok(state.app_state_root.clone())
}
