//! Relay прикладных событий из плагинов в Tauri.

use std::sync::OnceLock;

use tauri::{AppHandle, Emitter};

/// Глобальный AppHandle для эмиссии событий вне Tauri-команд.
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

/// Сохранение AppHandle для последующей эмиссии событий.
///
/// Повторный вызов игнорируется: handle устанавливается один раз при старте.
pub fn set_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

/// Эмиссия именованного прикладного события с JSON-payload.
///
/// Если AppHandle ещё не установлен (например, в тестах), вызов безвреден.
pub fn emit(name: &str, payload: serde_json::Value) {
    if let Some(app) = APP_HANDLE.get() {
        let _ = app.emit(name, payload);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Эмиссия без установленного AppHandle не паникует.
    #[test]
    fn emit_without_app_handle_is_safe() {
        emit("test:event", serde_json::json!({ "value": 1 }));
    }
}
