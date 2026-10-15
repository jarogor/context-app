//! Назначение плагина.

use serde::{Deserialize, Serialize};

/// Назначение плагина — предметная роль, которую он играет в приложении.
///
/// Назначение не определяет уровень плагина (каркас или приложение) и не
/// задаёт область его загрузки: за это отвечают признаки [`PluginLevel`] и
/// [`PluginScope`]. Значение `framework` описывает роль служебного плагина
/// каркаса и удобно для группировки в интерфейсе.
///
/// [`PluginLevel`]: crate::plugin::PluginLevel
/// [`PluginScope`]: crate::plugin::PluginScope
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginKind {
    /// Служебный плагин каркаса: настройки, уведомления, стор.
    #[serde(alias = "base")]
    Framework,
    /// Плагин-источник книг: каталог, импорт, чтение.
    #[serde(alias = "source")]
    Books,
    /// Плагин набора заметок.
    Notes,
    /// Плагин формата чтения: рисует область содержимого книги.
    #[serde(alias = "workplace")]
    Format,
    /// Обычный плагин-расширение.
    Extension,
}

impl Default for PluginKind {
    /// Назначение плагина по умолчанию.
    fn default() -> Self {
        Self::Extension
    }
}

impl PluginKind {
    /// Строковое имя назначения (совпадает с сериализацией).
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Framework => "framework",
            Self::Books => "books",
            Self::Notes => "notes",
            Self::Format => "format",
            Self::Extension => "extension",
        }
    }
}

impl std::fmt::Display for PluginKind {
    /// Форматирование имени назначения.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
