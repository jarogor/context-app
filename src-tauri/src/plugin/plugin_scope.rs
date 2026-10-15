//! Область загрузки плагина.

use serde::{Deserialize, Serialize};

/// Область загрузки плагина — когда runtime собирает его модуль.
///
/// Область не зависит ни от уровня плагина, ни от его назначения:
/// - прикладной плагин заметок грузится на уровне приложения, потому что нужен
///   до открытия библиотеки;
/// - прикладной плагин формата чтения грузится при открытии книги.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PluginScope {
    /// Уровень приложения: грузится при старте, доступен без библиотеки и книги.
    Application,
    /// Уровень сессии библиотеки: грузится при открытии библиотеки.
    Session,
    /// Уровень книги: грузится при открытии книги рабочим местом.
    Book,
}

impl Default for PluginScope {
    /// Область загрузки по умолчанию.
    fn default() -> Self {
        Self::Session
    }
}

impl PluginScope {
    /// Строковое имя области (совпадает с сериализацией).
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Application => "application",
            Self::Session => "session",
            Self::Book => "book",
        }
    }
}

impl std::fmt::Display for PluginScope {
    /// Форматирование имени области.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
