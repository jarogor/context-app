//! Разбор `metadata.opf` книги Calibre.
//!
//! Calibre кладёт в папку каждой книги `metadata.opf` с настоящими метаданными
//! (`dc:title`, `dc:creator`, серия). Это основной источник названия и авторов;
//! имена папок используются лишь как фолбэк.

use quick_xml::events::Event;
use quick_xml::Reader;

/// Метаданные, извлечённые из `metadata.opf`.
#[derive(Debug, Default, PartialEq)]
pub(crate) struct OpfMetadata {
    /// Название книги.
    pub title: Option<String>,
    /// Авторы книги.
    pub authors: Vec<String>,
    /// Серия и её номер.
    pub series: Option<(String, i64)>,
}

/// Извлечение метаданных из содержимого `metadata.opf`.
pub(crate) fn extract(bytes: &[u8]) -> OpfMetadata {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut metadata = OpfMetadata::default();
    let mut active = String::new();
    let mut text = String::new();
    let mut series: Option<String> = None;
    let mut series_index: Option<i64> = None;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                let name = local_name(event.name().as_ref());
                match name.as_str() {
                    "title" | "creator" => {
                        active = name;
                        text.clear();
                    }
                    "meta" => {
                        if let Some((key, value)) = meta_entry(&event) {
        match key.as_ref() {
                                "calibre:series" => series = Some(value),
                                "calibre:series_index" => series_index = value.parse().ok(),
                                _ => {}
                            }
                        }
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

    if let Some(name) = series {
        metadata.series = Some((name, series_index.unwrap_or(0)));
    }
    metadata
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

/// Пара `name`/`content` элемента `meta`.
fn meta_entry(event: &quick_xml::events::BytesStart<'_>) -> Option<(String, String)> {
    let mut name = None;
    let mut content = None;
    for entry in event.attributes().flatten() {
        let key = String::from_utf8_lossy(entry.key.as_ref());
        let Ok(value) = entry.unescape_value() else {
            continue;
        };
        match key.as_ref() {
            "name" => name = Some(value.into_owned()),
            "content" => content = Some(value.into_owned()),
            _ => {}
        }
    }
    Some((name?, content?))
}

#[cfg(test)]
#[path = "opf_tests.rs"]
mod tests;
