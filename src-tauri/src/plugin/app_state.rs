//! Объединённое состояние plugin host приложения.

use std::path::{Path, PathBuf};

use crate::plugin::{AppPluginHost, PluginSession};

/// Состояние приложения: сессия библиотечного plugin-а и app-level runtime.
pub struct AppState {
    /// Сессия активного source-плагина библиотеки.
    pub session: PluginSession,
    /// App-level runtime базовых плагинов каркаса.
    pub app_host: AppPluginHost,
    /// Корень служебного состояния приложения.
    pub app_state_root: PathBuf,
}

impl AppState {
    /// Создание состояния из готовых составляющих.
    pub fn new(session: PluginSession, app_host: AppPluginHost, app_state_root: PathBuf) -> Self {
        Self {
            session,
            app_host,
            app_state_root,
        }
    }

    /// Корень служебного состояния приложения.
    pub fn app_state_root(&self) -> &Path {
        &self.app_state_root
    }
}
