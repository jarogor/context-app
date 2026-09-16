//! Разбор метаданных `metadata.opf` из папки книги Calibre.

use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;

use super::models::Metadata;

/// Чтение поддерживаемых полей OPF.
///
/// Ошибка разбора оставляется вызывающему, чтобы сканер мог перейти к
/// значениям из структуры каталогов.
pub(crate) fn parse(path: &Path) -> Result<Metadata, String> {
    let data = std::fs::read(path).map_err(|err| err.to_string())?;
    let mut reader = Reader::from_reader(data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut metadata = Metadata::default();
    let mut current = None::<String>;
    let mut series_name = None::<String>;
    let mut series_index = 0.0_f64;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                let name = String::from_utf8_lossy(element.local_name().as_ref()).to_string();
                current = matches!(name.as_str(), "title" | "creator" | "subject" | "language")
                    .then_some(name.clone());
                if name == "meta" {
                    let mut name_attr = None;
                    let mut content = None;
                    for attribute in element.attributes().flatten() {
                        match attribute.key.local_name().as_ref() {
                            b"name" => {
                                name_attr = Some(
                                    attribute
                                        .unescape_value()
                                        .map_err(|e| e.to_string())?
                                        .into_owned(),
                                )
                            }
                            b"content" => {
                                content = Some(
                                    attribute
                                        .unescape_value()
                                        .map_err(|e| e.to_string())?
                                        .into_owned(),
                                )
                            }
                            _ => {}
                        }
                    }
                    match (name_attr.as_deref(), content) {
                        (Some("calibre:series"), Some(value)) => series_name = Some(value),
                        (Some("calibre:series_index"), Some(value)) => {
                            series_index = value.parse().unwrap_or(0.0);
                        }
                        (Some("cover"), Some(value)) => metadata.cover = Some(value),
                        _ => {}
                    }
                }
            }
            Ok(Event::Text(text)) => {
                if let Some(element) = current.as_deref() {
                    let value = text
                        .unescape()
                        .map_err(|e| e.to_string())?
                        .trim()
                        .to_string();
                    if !value.is_empty() {
                        match element {
                            "title" if metadata.title.is_none() => metadata.title = Some(value),
                            "creator" => metadata.authors.push(value),
                            "subject" => metadata.tags.push(value),
                            "language" if metadata.language.is_none() => {
                                metadata.language = Some(value)
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::End(_)) => current = None,
            Ok(Event::Eof) => break,
            Err(error) => return Err(error.to_string()),
            _ => {}
        }
        buffer.clear();
    }

    if let Some(name) = series_name {
        metadata.series = Some((name, series_index.round() as i64));
    }
    Ok(metadata)
}

#[cfg(test)]
#[path = "metadata_tests.rs"]
mod tests;
