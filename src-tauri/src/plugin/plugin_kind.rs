//! Категория плагина.

use serde::{Deserialize, Serialize};

/// Категория плагина, определяющая уровень его загрузки приложением.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
    /// Базовый плагин каркаса приложения (уведомления, настройки).
    Base,
    /// Source-плагин формата каталога.
    Source,
    /// Обычный extension-плагин.
    Extension,
    /// Плагин рабочего места: рисует область содержимого книги.
    Workplace,
    /// Frontend-плагин интерфейса.
    Ui,
}

impl Default for PluginKind {
    /// Категория плагина по умолчанию.
    fn default() -> Self {
        Self::Extension
    }
}
