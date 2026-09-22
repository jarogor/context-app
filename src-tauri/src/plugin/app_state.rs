//! Объединённое состояние plugin host приложения.

use crate::plugin::{AppPluginHost, PluginSession};

/// Состояние приложения: сессия библиотечного plugin-а и app-level runtime.
pub struct AppState {
    /// Сессия активного source-плагина библиотеки.
    pub session: PluginSession,
    /// App-level runtime базовых плагинов каркаса.
    pub app_host: AppPluginHost,
}

impl AppState {
    /// Создание состояния из готовых составляющих.
    pub fn new(session: PluginSession, app_host: AppPluginHost) -> Self {
        Self { session, app_host }
    }
}
