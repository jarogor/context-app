//! Команды для работы с журналом уведомлений.
//!
//! Предоставляет Tauri-команды для получения записей, пометки прочитанных
//! и очистки журнала.

use std::sync::OnceLock;

use tauri::{AppHandle, Emitter};

use crate::journal::{get_journal_handle, Entry, Level};

/// Глобальный AppHandle для эмиссии событий журнала вне Tauri-команд.
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Сохраняет AppHandle для последующей эмиссии событий журнала.
///
/// Повторный вызов игнорируется: handle устанавливается один раз при старте.
pub fn set_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

/// Эмитирует событие добавления новой записи в журнал.
///
/// Если AppHandle ещё не установлен (например, в тестах), вызов безвреден.
pub fn notify_journal_entry(entry: Entry) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit("journal:added", entry);
    }
}

/// Возвращает все записи журнала.
///
/// Фильтр по уровню опционален:
/// - `None` → все записи
/// - `Some(User)` → только пользовательские
/// - `Some(Technical)` → только технические
#[tauri::command]
pub fn list_journal(level: Option<Level>) -> Result<Vec<Entry>, String> {
    let handle = get_journal_handle();
    Ok(handle.all(level))
}

/// Помечает записи как прочитанные.
#[tauri::command]
pub fn mark_read(ids: Vec<u64>) -> Result<(), String> {
    let handle = get_journal_handle();
    handle.mark_read(&ids);
    Ok(())
}

/// Помечает все записи как прочитанными.
#[tauri::command]
pub fn mark_all_read() -> Result<(), String> {
    let handle = get_journal_handle();
    handle.mark_all_read();
    Ok(())
}

/// Очищает весь журнал.
#[tauri::command]
pub fn clear_journal() -> Result<(), String> {
    let handle = get_journal_handle();
    handle.clear();
    Ok(())
}
