//! DTO протокола жизненного цикла source-плагинов.

use serde::{Deserialize, Serialize};

/// Версия протокола source lifecycle.
pub(crate) const SOURCE_PROTOCOL_VERSION: u32 = 1;

/// Возможности, объявленные source-плагином.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SourceCapabilities {
    /// Версия протокола source lifecycle.
    pub protocol_version: u32,
    /// Поддерживаются ли операции записи во внешнее состояние приложения.
    pub state_storage: bool,
    /// Поддерживается ли инкрементальная синхронизация.
    pub incremental_sync: bool,
}

/// Файл книги в нейтральном каталоге source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SourceFile {
    /// Назначение файла.
    pub kind: SourceFileKind,
    /// Путь к файлу относительно корня источника.
    pub path: String,
    /// Формат файла в нижнем регистре.
    pub format: String,
}

/// Назначение файла в каталоге source-плагина.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum SourceFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

/// Книга нейтрального каталога source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SourceBook {
    /// Стабильный идентификатор книги внутри source-плагина.
    pub id: String,
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Теги книги.
    pub tags: Vec<String>,
    /// Серии книги с порядковыми номерами.
    pub series: Vec<(String, i64)>,
    /// Файлы книги.
    pub files: Vec<SourceFile>,
}

/// Согласованный snapshot каталога source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SourceCatalog {
    /// Версия протокола source lifecycle.
    pub protocol_version: u32,
    /// Версия состояния каталога.
    pub revision: u64,
    /// Книги каталога.
    pub books: Vec<SourceBook>,
}

/// Диагностика ошибки source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[allow(dead_code)]
pub(crate) struct SourceError {
    /// Машиночитаемый код ошибки.
    pub code: String,
    /// Человекочитаемое описание ошибки.
    pub message: String,
}

/// Ответ операции `probe`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SourceProbeResponse {
    /// Поддерживается ли активный корень.
    pub supported: bool,
}

/// Ответ операции `open`.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub(crate) struct SourceOpenResponse {
    /// Идентификатор состояния source-сессии.
    pub session_id: String,
    /// Согласованный каталог после открытия.
    pub catalog: SourceCatalog,
}

impl SourceCatalog {
    /// Проверка совместимости snapshot с текущим ядром.
    pub(crate) fn validate(&self) -> Result<(), String> {
        if self.protocol_version != SOURCE_PROTOCOL_VERSION {
            return Err(format!(
                "неподдерживаемая версия source snapshot: {}",
                self.protocol_version
            ));
        }
        Ok(())
    }
}

#[cfg(test)]
#[path = "source_protocol_tests.rs"]
mod tests;
