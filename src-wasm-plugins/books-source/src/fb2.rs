//! Анализатор метаданных FB2.
//!
//! Извлекает название (`book-title`), авторов (`author`) и встроенную обложку
//! (`coverpage` → `binary`).

use base64::Engine;
use format_parsers::xml::strip_markup;
use quick_xml::events::Event;
use quick_xml::Reader;

use crate::models::BookMetadata;

/// Извлечение метаданных из содержимого FB2.
pub(crate) fn extract(bytes: &[u8]) -> BookMetadata {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut title: Option<String> = None;
    let mut authors: Vec<String> = Vec::new();
    let mut binaries: Vec<(String, Vec<u8>, String)> = Vec::new();
    let mut cover_href: Option<String> = None;
    let mut active_tag = String::new();
    let mut active_text = String::new();
    let mut author_parts: Vec<String> = Vec::new();
    let mut binary: Option<(String, String)> = None;
    let mut language: Option<String> = None;
    let mut published: Option<String> = None;
    let mut publisher: Option<String> = None;
    let mut identifier: Option<String> = None;
    let mut description: Option<String> = None;
    // Глубина вложенности внутри `<annotation>`: описание может содержать
    // разметку, поэтому текст собирается по всем вложенным элементам.
    let mut annotation_depth = 0usize;
    let mut annotation_text = String::new();

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                let name = local_name(event.name().as_ref());
                if annotation_depth > 0 {
                    annotation_depth += 1;
                } else {
                    match name.as_str() {
                        "book-title" | "first-name" | "middle-name" | "last-name" | "nickname"
                        | "lang" | "date" | "publisher" | "isbn" => {
                            active_tag = name;
                            active_text.clear();
                        }
                        "annotation" => {
                            annotation_depth = 1;
                            annotation_text.clear();
                        }
                        "author" => {
                            author_parts.clear();
                        }
                        "image" => {
                            if cover_href.is_none() {
                                cover_href = href_attribute(&event);
                            }
                        }
                        "binary" => {
                            let id = attribute(&event, "id").unwrap_or_default();
                            let content_type =
                                attribute(&event, "content-type").unwrap_or_default();
                            active_text.clear();
                            binary = Some((id, content_type));
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Empty(event)) => {
                if local_name(event.name().as_ref()) == "image" && cover_href.is_none() {
                    cover_href = href_attribute(&event);
                }
            }
            Ok(Event::Text(event)) => {
                let text = event.unescape().unwrap_or_default().into_owned();
                if annotation_depth > 0 {
                    // Текст OPF обрезан по краям: границы слов между вложенными
                    // элементами восстанавливаются пробелом.
                    let chunk = text.trim();
                    if !chunk.is_empty() {
                        let needs_space = annotation_text
                            .chars()
                            .last()
                            .is_some_and(char::is_alphanumeric)
                            && chunk.chars().next().is_some_and(char::is_alphanumeric);
                        if needs_space {
                            annotation_text.push(' ');
                        }
                        annotation_text.push_str(chunk);
                    }
                } else if binary.is_some() || !active_tag.is_empty() {
                    active_text.push_str(&text);
                }
            }
            Ok(Event::End(event)) => {
                let name = local_name(event.name().as_ref());
                if annotation_depth > 0 {
                    annotation_depth -= 1;
                    if annotation_depth == 0 {
                        description = non_empty(strip_markup(&annotation_text));
                    }
                } else {
                    match name.as_str() {
                        "book-title" => {
                            capture_title(&mut title, &active_text);
                            active_tag.clear();
                        }
                        "first-name" | "middle-name" | "last-name" | "nickname" => {
                            let value = active_text.trim();
                            if !value.is_empty() {
                                author_parts.push(value.to_string());
                            }
                            active_tag.clear();
                        }
                        "lang" => {
                            language = non_empty(active_text.clone());
                            active_tag.clear();
                        }
                        "date" => {
                            published = non_empty(active_text.clone());
                            active_tag.clear();
                        }
                        "publisher" => {
                            publisher = non_empty(active_text.clone());
                            active_tag.clear();
                        }
                        "isbn" => {
                            identifier = non_empty(active_text.clone());
                            active_tag.clear();
                        }
                        "author" => {
                            if !author_parts.is_empty() {
                                authors.push(author_parts.join(" "));
                            }
                        }
                        "binary" => {
                            if let Some((id, content_type)) = binary.take() {
                                if let Ok(data) = base64::engine::general_purpose::STANDARD
                                    .decode(active_text.trim())
                                {
                                    binaries.push((id, data, format_from(&content_type)));
                                }
                            }
                            active_text.clear();
                        }
                        _ => {}
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }

    let cover = cover_href
        .as_deref()
        .map(|href| href.trim_start_matches('#'))
        .and_then(|id| {
            binaries
                .into_iter()
                .find(|(binary_id, _, _)| binary_id == id)
                .map(|(_, data, format)| (data, format))
        });

    BookMetadata {
        title,
        authors,
        cover,
        language,
        published,
        publisher,
        description,
        identifier,
    }
}

/// Значение, если после обрезки оно не пустое.
fn non_empty(value: String) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

/// Запись названия, если оно ещё не задано.
fn capture_title(title: &mut Option<String>, text: &str) {
    if title.is_none() {
        let value = text.trim();
        if !value.is_empty() {
            *title = Some(value.to_string());
        }
    }
}

/// Локальное имя элемента без префикса пространства имён.
fn local_name(name: &[u8]) -> String {
    let value = String::from_utf8_lossy(name);
    value
        .rsplit(':')
        .next()
        .unwrap_or(&value)
        .to_ascii_lowercase()
}

/// Значение атрибута с указанным локальным именем.
fn attribute(event: &quick_xml::events::BytesStart<'_>, attribute: &str) -> Option<String> {
    for entry in event.attributes().flatten() {
        let key = String::from_utf8_lossy(entry.key.as_ref());
        if key.rsplit(':').next() == Some(attribute) {
            if let Ok(value) = entry.unescape_value() {
                return Some(value.into_owned());
            }
        }
    }
    None
}

/// Значение атрибута `href` (с любым префиксом).
fn href_attribute(event: &quick_xml::events::BytesStart<'_>) -> Option<String> {
    for entry in event.attributes().flatten() {
        let key = String::from_utf8_lossy(entry.key.as_ref());
        if key.rsplit(':').next() == Some("href") {
            if let Ok(value) = entry.unescape_value() {
                return Some(value.into_owned());
            }
        }
    }
    None
}

/// Формат изображения по медиатипу.
fn format_from(content_type: &str) -> String {
    let value = content_type.to_ascii_lowercase();
    if value.contains("png") {
        "png".to_string()
    } else if value.contains("gif") {
        "gif".to_string()
    } else if value.contains("webp") {
        "webp".to_string()
    } else {
        "jpeg".to_string()
    }
}

#[cfg(test)]
#[path = "fb2_tests.rs"]
mod tests;
