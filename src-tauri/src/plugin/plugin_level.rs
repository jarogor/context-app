//! Уровень плагина: каркас или приложение.

use serde::{Deserialize, Serialize};

/// Уровень плагина — принадлежность каркасу или приложению.
///
/// Уровень задаёт правила жизненного цикла: каркасные плагины поставляются
/// вместе с каркасом, не отключаются и не удаляются; прикладные плагины
/// отключаются, удаляются и обновляются по частям. Уровень не определяет
/// область загрузки: за неё отвечает [`PluginScope`].
///
/// [`PluginScope`]: crate::plugin::PluginScope
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PluginLevel {
    /// Плагин каркаса: обезличенный служебный функционал.
    Framework,
    /// Плагин приложения: предметная логика.
    Application,
}

impl Default for PluginLevel {
    /// Уровень плагина по умолчанию.
    fn default() -> Self {
        Self::Application
    }
}

impl PluginLevel {
    /// Строковое имя уровня (совпадает с сериализацией).
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Framework => "framework",
            Self::Application => "application",
        }
    }

    /// Признак каркасного плагина.
    pub fn is_framework(&self) -> bool {
        matches!(self, Self::Framework)
    }
}

impl std::fmt::Display for PluginLevel {
    /// Форматирование имени уровня.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}
