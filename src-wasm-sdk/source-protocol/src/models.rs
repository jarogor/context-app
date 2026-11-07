//! Модели данных source-плагинов библиотек.
//!
//! Содержит только структуры и перечисления без поведенческой логики.
//! Структуры повторяют нейтральное представление каталога, которое
//! интерпретирует оболочка (`src/features/library/library.ts`): разбор их из
//! JSON выполняется приложением, поэтому имена и порядок полей должны
//! совпадать.

use serde::{Deserialize, Serialize};

/// Версия протокола source lifecycle.
///
/// Приложение ещё не в продакшне: протокол — версия 1, и совместимость между
/// версиями не поддерживается. Поле нужно, чтобы формат был опознан, а не чтобы
/// вести переговоры о версиях.
pub const SOURCE_PROTOCOL_VERSION: u32 = 1;

/// Книга, обнаруженная при сканировании директории.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ExternalBook {
    /// Стабильный идентификатор книги внутри source-плагина.
    pub id: String,
    /// Название книги.
    pub title: String,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Теги книги (принадлежат источнику: `dc:subject`, теги Calibre).
    #[serde(default)]
    pub tags: Vec<String>,
    /// Серии книги с порядковыми номерами.
    #[serde(default)]
    pub series: Vec<(String, i64)>,
    /// Файлы книги: содержимое и обложка.
    pub files: Vec<ExternalFile>,
    /// Язык книги (BCP-47 либо значение из файла).
    #[serde(default)]
    pub language: Option<String>,
    /// Дата выхода в виде строки ISO (`2019-05-01` либо с точностью до года).
    #[serde(default)]
    pub published: Option<String>,
    /// Издатель.
    #[serde(default)]
    pub publisher: Option<String>,
    /// Описание книги.
    #[serde(default)]
    pub description: Option<String>,
    /// Идентификатор издания (ISBN и подобное).
    #[serde(default)]
    pub identifier: Option<String>,
    /// Суммарный размер файлов содержимого в байтах.
    #[serde(default)]
    pub size: Option<u64>,
    /// Когда книга впервые появилась в библиотеке (Unix, мс).
    #[serde(default)]
    pub added_at_ms: Option<i64>,
    /// Есть ли у книги обложка в индексе источника.
    ///
    /// Сами обложки запрашиваются отдельно и только для видимых книг: они
    /// тяжёлые, а списку нужен лишь признак для фильтра.
    #[serde(default)]
    pub has_cover: Option<bool>,
}

/// Файл, обнаруженный при сканировании папки книги.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExternalFile {
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
pub enum ExternalFileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

/// Тип записи директории без следования по символической ссылке.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    /// Обычный файл.
    File,
    /// Каталог.
    Dir,
    /// Символическая ссылка.
    Symlink,
}

/// Запись директории.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct DirEntry {
    /// Имя записи.
    pub name: String,
    /// Тип записи.
    pub kind: EntryKind,
    /// Размер файла в байтах; `None` для каталогов, ссылок и при недоступности.
    #[serde(default)]
    pub size: Option<u64>,
    /// Время изменения в миллисекундах Unix; `None` при недоступности.
    #[serde(default)]
    pub mtime_ms: Option<i64>,
}

/// Извлечённые из файла метаданные книги.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BookMetadata {
    /// Название из содержимого.
    pub title: Option<String>,
    /// Авторы из содержимого.
    pub authors: Vec<String>,
    /// Обложка: байты и формат (`jpeg`, `png`, …).
    pub cover: Option<(Vec<u8>, String)>,
    /// Язык книги.
    pub language: Option<String>,
    /// Дата выхода.
    pub published: Option<String>,
    /// Издатель.
    pub publisher: Option<String>,
    /// Описание.
    pub description: Option<String>,
    /// Идентификатор издания (ISBN).
    pub identifier: Option<String>,
}

/// Возможности source-плагина.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SourceCapabilities {
    /// Версия протокола source lifecycle.
    pub protocol_version: u32,
    /// Поддерживается ли служебное состояние.
    pub state_storage: bool,
    /// Поддерживается ли инкрементальная синхронизация.
    pub incremental_sync: bool,
}

/// Нейтральный snapshot каталога.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SourceCatalog {
    /// Версия протокола snapshot.
    pub protocol_version: u32,
    /// Номер ревизии каталога.
    pub revision: u64,
    /// Книги каталога.
    pub books: Vec<ExternalBook>,
}
