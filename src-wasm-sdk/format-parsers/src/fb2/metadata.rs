//! Метаданные FB2: название, авторы и встроенная обложка.
//!
//! Разбор общий для плагина формата и источника книг: оба показывают название и
//! авторов, а обложка нужна списку книг. Изображения книги (`<binary>`) здесь не
//! разбираются в главы — это дело [`crate::fb2`].

use base64::Engine;
use quick_xml::events::Event;
use quick_xml::Reader;

/// Метаданные книги FB2.
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
pub struct Fb2Metadata {
    /// Название книги; пустое, если не задано.
    pub title: String,
    /// Авторы в порядке книги.
    pub authors: Vec<String>,
    /// Встроенная обложка: байты и формат (`png`, `jpeg`), если она есть.
    #[serde(skip)]
    pub cover: Option<(Vec<u8>, String)>,
}

/// Извлечение метаданных из содержимого FB2.
///
/// Ошибка разбора не прерывает чтения: возвращаются те поля, которые удалось
/// прочитать. Так книга без корректного заголовка всё равно открывается.
pub fn extract(bytes: &[u8]) -> Fb2Metadata {
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

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                let name = local_name(event.name().as_ref());
                match name.as_str() {
                    "book-title" | "first-name" | "middle-name" | "last-name" | "nickname" => {
                        active_tag = name;
                        active_text.clear();
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
                        let content_type = attribute(&event, "content-type").unwrap_or_default();
                        active_text.clear();
                        binary = Some((id, content_type));
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(event)) => {
                if local_name(event.name().as_ref()) == "image" && cover_href.is_none() {
                    cover_href = href_attribute(&event);
                }
            }
            Ok(Event::Text(event)) => {
                let text = event.unescape().unwrap_or_default().into_owned();
                if binary.is_some() || !active_tag.is_empty() {
                    active_text.push_str(&text);
                }
            }
            Ok(Event::End(event)) => {
                let name = local_name(event.name().as_ref());
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
                    "author" => {
                        if !author_parts.is_empty() {
                            authors.push(author_parts.join(" "));
                        }
                    }
                    "binary" => {
                        if let Some((id, content_type)) = binary.take() {
                            if let Ok(data) =
                                base64::engine::general_purpose::STANDARD.decode(active_text.trim())
                            {
                                binaries.push((id, data, format_from(&content_type)));
                            }
                        }
                        active_text.clear();
                    }
                    _ => {}
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

    Fb2Metadata {
        title: title.unwrap_or_default(),
        authors,
        cover,
    }
}

/// Имя тега без пространства имён.
fn local_name(name: &[u8]) -> String {
    let text = String::from_utf8_lossy(name);
    text.rsplit(':').next().unwrap_or(&text).to_ascii_lowercase()
}

/// Значение атрибута по локальному имени.
fn attribute(event: &quick_xml::events::BytesStart, key: &str) -> Option<String> {
    event.attributes().flatten().find_map(|attribute| {
        let name = String::from_utf8_lossy(attribute.key.as_ref()).to_string();
        let local = name.rsplit(':').next().unwrap_or(&name);
        if local.eq_ignore_ascii_case(key) {
            attribute.unescape_value().ok().map(|value| value.into_owned())
        } else {
            None
        }
    })
}

/// Атрибут ссылки на изображение (`href` или `xlink:href`).
fn href_attribute(event: &quick_xml::events::BytesStart) -> Option<String> {
    attribute(event, "href")
}

/// Запоминание названия книги (первое непустое).
fn capture_title(title: &mut Option<String>, value: &str) {
    if title.is_some() {
        return;
    }
    let trimmed = value.trim();
    if !trimmed.is_empty() {
        *title = Some(trimmed.to_string());
    }
}

/// Формат обложки по MIME-типу.
fn format_from(content_type: &str) -> String {
    let lowered = content_type.to_ascii_lowercase();
    if lowered.contains("png") {
        "png".to_string()
    } else if lowered.contains("gif") {
        "gif".to_string()
    } else if lowered.contains("webp") {
        "webp".to_string()
    } else {
        "jpeg".to_string()
    }
}
