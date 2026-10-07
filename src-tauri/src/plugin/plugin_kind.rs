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
}

impl Default for PluginKind {
    /// Категория плагина по умолчанию.
    fn default() -> Self {
        Self::Extension
    }
}

impl PluginKind {
    /// Строковое имя категории плагина (совпадает с сериализацией).
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Base => "base",
            Self::Source => "source",
            Self::Extension => "extension",
            Self::Workplace => "workplace",
        }
    }
}

impl std::fmt::Display for PluginKind {
    /// Форматирование имени категории плагина.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
