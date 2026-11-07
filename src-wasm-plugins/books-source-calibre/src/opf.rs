//! Разбор `metadata.opf` книги Calibre.
//!
//! Calibre кладёт в папку каждой книги `metadata.opf` с настоящими метаданными
//! (`dc:title`, `dc:creator`, серия). Это основной источник названия и авторов;
//! имена папок используются лишь как фолбэк.

use quick_xml::events::Event;
use quick_xml::Reader;

use format_parsers::xml::strip_markup;

/// Метаданные, извлечённые из `metadata.opf`.
#[derive(Debug, Default, PartialEq)]
pub(crate) struct OpfMetadata {
    /// Название книги.
    pub title: Option<String>,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Теги книги (`dc:subject`).
    pub tags: Vec<String>,
    /// Язык книги.
    pub language: Option<String>,
    /// Дата выхода.
    pub published: Option<String>,
    /// Издатель.
    pub publisher: Option<String>,
    /// Описание книги.
    pub description: Option<String>,
    /// Идентификатор издания; предпочитается ISBN.
    pub identifier: Option<String>,
}

/// Извлечение метаданных из содержимого `metadata.opf`.
pub(crate) fn extract(bytes: &[u8]) -> OpfMetadata {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut metadata = OpfMetadata::default();
    let mut active = String::new();
    let mut text = String::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                let name = local_name(event.name().as_ref());
                match name.as_str() {
                    "title" | "creator" | "language" | "date" | "publisher" | "description"
                    | "subject" | "identifier" => {
                        active = name;
                        text.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(event)) => {
                if !active.is_empty() {
                    text.push_str(&event.unescape().unwrap_or_default());
                }
            }
            Ok(Event::End(event)) => {
                let name = local_name(event.name().as_ref());
                if name == active {
                    let value = text.trim();
                    if !value.is_empty() {
                        match name.as_str() {
                            "title" if metadata.title.is_none() => {
                                metadata.title = Some(value.to_string())
                            }
                            "creator" => metadata.authors.push(value.to_string()),
                            "language" => metadata.language = Some(value.to_string()),
                            "date" => metadata.published = Some(value.to_string()),
                            "publisher" => metadata.publisher = Some(value.to_string()),
                            "description" => {
                                let description = strip_markup(value);
                                if !description.is_empty() {
                                    metadata.description = Some(description);
                                }
                            }
                            "subject" => {
                                if !metadata.tags.iter().any(|tag| tag == value) {
                                    metadata.tags.push(value.to_string());
                                }
                            }
                            "identifier" => set_identifier(&mut metadata.identifier, value),
                            _ => {}
                        }
                    }
                    active.clear();
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    metadata
}

/// Запись идентификатора издания: ISBN предпочитается прочим значениям.
fn set_identifier(target: &mut Option<String>, value: &str) {
    if target
        .as_deref()
        .is_some_and(|current| current.to_ascii_lowercase().contains("isbn"))
    {
        return;
    }
    if value.to_ascii_lowercase().contains("isbn") || target.is_none() {
        *target = Some(value.to_string());
    }
}

/// Локальное имя элемента без префикса.
fn local_name(name: &[u8]) -> String {
    let value = String::from_utf8_lossy(name);
    value
        .rsplit(':')
        .next()
        .unwrap_or(&value)
        .to_ascii_lowercase()
}

#[cfg(test)]
#[path = "opf_tests.rs"]
mod tests;
