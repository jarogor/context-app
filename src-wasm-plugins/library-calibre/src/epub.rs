//! Разбор EPUB внутри WASM без доступа к операционной системе.
//!
//! Модуль не зависит от целевой архитектуры: используется как в WASM-точке
//! входа, так и в нативных тестах.

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

/// Извлечение названия и авторов из метаданных EPUB.
pub(crate) fn parse_epub_metadata(bytes: &[u8]) -> Result<(String, Vec<String>), String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let container_text = {
        let mut container = archive
            .by_name("META-INF/container.xml")
            .map_err(|_| "в EPUB отсутствует container.xml".to_string())?;
        let mut bytes = Vec::new();
        container
            .read_to_end(&mut bytes)
            .map_err(|_| "не удалось прочитать container.xml".to_string())?;
        bytes
    };
    let rootfile = attribute_value(&container_text, "rootfile", "full-path")
        .or_else(|| text_between(&container_text, "full-path"))
        .ok_or_else(|| "в EPUB отсутствует content.opf".to_string())?;
    let opf_text = {
        let mut opf = archive
            .by_name(&rootfile)
            .map_err(|_| "не удалось открыть content.opf".to_string())?;
        let mut bytes = Vec::new();
        opf.read_to_end(&mut bytes)
            .map_err(|_| "не удалось прочитать content.opf".to_string())?;
        bytes
    };
    let title = text_between(&opf_text, "dc:title").unwrap_or_else(|| "Без названия".to_string());
    let authors = all_text_between(&opf_text, "dc:creator");
    Ok((title, authors))
}

/// Извлечение текста XHTML-глав из EPUB.
pub(crate) fn read_epub_text(bytes: &[u8]) -> Result<String, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let mut chapters = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|_| "не удалось прочитать EPUB".to_string())?;
        let name = file.name().to_ascii_lowercase();
        if !(name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")) {
            continue;
        }
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|_| "глава EPUB не является текстом".to_string())?;
        chapters.push(strip_markup(&content));
    }
    Ok(chapters.join("\n\n"))
}

/// Значение атрибута элемента в XML.
fn attribute_value(bytes: &[u8], element: &str, attribute: &str) -> Option<String> {
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
fn text_between(bytes: &[u8], tag: &str) -> Option<String> {
    all_text_between(bytes, tag).into_iter().next()
}

/// Все текстовые значения указанного тега.
fn all_text_between(bytes: &[u8], tag: &str) -> Vec<String> {
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
fn strip_markup(value: &str) -> String {
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
