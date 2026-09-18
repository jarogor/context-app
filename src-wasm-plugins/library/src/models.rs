//! Модели данных базового source-плагина библиотеки.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Структуры повторяют контракт ядра (`sources::models`): разбор их из JSON
//! выполняется приложением, поэтому имена и порядок полей должны совпадать.

use serde::{Deserialize, Serialize};

/// Версия протокола source lifecycle.
pub(crate) const SOURCE_PROTOCOL_VERSION: u32 = 1;

/// Книга, обнаруженная при сканировании директории.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct ExternalBook {
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
    /// Файлы книги: содержимое и обложка.
    pub files: Vec<ExternalFile>,
}

/// Файл, обнаруженный при сканировании папки книги.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct ExternalFile {
    /// Назначение файла: содержимое или обложка.
    pub kind: ExternalFileKind,
    /// Путь к файлу относительно корня библиотеки.
    pub path: String,
    /// Расширение файла в нижнем регистре.
    pub format: String,
}

/// Назначение файла в папке книги.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ExternalFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

/// Возможности базового source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SourceCapabilities {
    /// Версия протокола source lifecycle.
    pub protocol_version: u32,
    /// Поддерживается ли служебное состояние.
    pub state_storage: bool,
    /// Поддерживается ли инкрементальная синхронизация.
    pub incremental_sync: bool,
}

/// Нейтральный snapshot каталога.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub(crate) struct SourceCatalog {
    /// Версия протокола snapshot.
    pub protocol_version: u32,
    /// Номер ревизии каталога.
    pub revision: u64,
    /// Книги каталога.
    pub books: Vec<ExternalBook>,
}

/// Сохранённое состояние source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub(crate) struct SourceState {
    /// Версия формата состояния.
    pub version: u32,
    /// Fingerprint последнего сканирования.
    pub fingerprint: String,
    /// Последний согласованный каталог.
    pub catalog: SourceCatalog,
}
