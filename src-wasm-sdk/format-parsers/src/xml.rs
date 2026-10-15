//! Хелперы разбора XML/OPF, общие для source-плагинов библиотек.
//!
//! Минимальный разбор через `quick-xml`: значение атрибута по локальному имени
//! и текстовые значения тега без учёта префикса пространства имён.

use quick_xml::events::Event;
use quick_xml::Reader;

/// Значение атрибута элемента в XML.
///
/// Находит первый элемент, локальное имя которого заканчивается на `element`,
/// и возвращает значение атрибута с локальным именем `attribute`.
pub fn attribute_value(bytes: &[u8], element: &str, attribute: &str) -> Option<String> {
    let mut reader = Reader::from_reader(bytes);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if String::from_utf8_lossy(event.name().as_ref()).ends_with(element) {
                    for attribute_entry in event.attributes().flatten() {
                        let key = String::from_utf8_lossy(attribute_entry.key.as_ref()).to_string();
                        if key.ends_with(attribute) {
                            if let Ok(value) = attribute_entry.unescape_value() {
                                return Some(value.into_owned());
                            }
                        }
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    None
}

/// Первое текстовое значение указанного тега.
pub fn text_between(bytes: &[u8], tag: &str) -> Option<String> {
    all_text_between(bytes, tag).into_iter().next()
}

/// Все текстовые значения указанного тега.
pub fn all_text_between(bytes: &[u8], tag: &str) -> Vec<String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut active = false;
    let mut values = Vec::new();
    let mut current = String::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                active = String::from_utf8_lossy(event.name().as_ref()).ends_with(tag);
                current.clear();
            }
            Ok(Event::Text(event)) if active => {
                current.push_str(&String::from_utf8_lossy(event.as_ref()));
            }
            Ok(Event::End(_)) if active => {
                if !current.is_empty() {
                    values.push(current.clone());
                }
                active = false;
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    values
}

/// Удаление разметки и схлопывание пробелов.
pub fn strip_markup(value: &str) -> String {
    let mut result = String::new();
    let mut inside = false;
    for character in value.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            character if !inside => result.push(character),
            _ => {}
        }
    }
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Локальное имя элемента без префикса пространства имён.
pub fn local_name(name: &[u8]) -> String {
    let value = String::from_utf8_lossy(name);
    value
        .rsplit(':')
        .next()
        .unwrap_or(&value)
        .to_ascii_lowercase()
}

/// Формат изображения по медиатипу (`png`, `gif`, `webp`, иначе `jpeg`).
pub fn format_from_media_type(content_type: &str) -> String {
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
