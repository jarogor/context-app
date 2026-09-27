//! Разбор EPUB внутри WASM без доступа к операционной системе.
//!
//! Модуль не зависит от целевой архитектуры: используется как в WASM-точке
//! входа, так и в нативных тестах.

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

use crate::models::BookMetadata;

/// Извлечение метаданных (название, авторы, обложка) из содержимого EPUB.
pub(crate) fn extract(bytes: &[u8]) -> Result<BookMetadata, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let container = read_zip_entry(&mut archive, "META-INF/container.xml")?;
    let rootfile = attribute_value(&container, "rootfile", "full-path")
        .or_else(|| text_between(&container, "full-path"))
        .ok_or_else(|| "в EPUB отсутствует content.opf".to_string())?;
    let opf = read_zip_entry(&mut archive, &rootfile)?;
    let title = text_between(&opf, "dc:title").filter(|value| !value.is_empty());
    let authors = all_text_between(&opf, "dc:creator")
        .into_iter()
        .filter(|value| !value.is_empty())
        .collect();
    let cover = epub_cover(&mut archive, &opf, &rootfile);
    Ok(BookMetadata {
        title,
        authors,
        cover,
    })
}

/// Чтение записи архива EPUB.
fn read_zip_entry(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    name: &str,
) -> Result<Vec<u8>, String> {
    let mut file = archive
        .by_name(name)
        .map_err(|_| format!("в EPUB нет {name}"))?;
    let mut bytes = Vec::new();
    file.read_to_end(&mut bytes)
        .map_err(|_| format!("не удалось прочитать {name}"))?;
    Ok(bytes)
}

/// Описание элемента манифеста OPF.
struct ManifestItem {
    id: String,
    href: String,
    properties: String,
    media_type: Option<String>,
}

/// Извлечение обложки EPUB из манифеста OPF.
fn epub_cover(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    opf: &[u8],
    opf_path: &str,
) -> Option<(Vec<u8>, String)> {
    let (cover_id, items) = manifest_items(opf);
    let href = items
        .iter()
        .find(|item| Some(&item.id) == cover_id.as_ref())
        .or_else(|| {
            items
                .iter()
                .find(|item| item.properties.contains("cover-image"))
        })
        .map(|item| item.href.clone())?;
    let media_type = items
        .iter()
        .find(|item| item.href == href)
        .and_then(|item| item.media_type.clone());
    let path = resolve_relative(opf_path, &href)?;
    let bytes = read_zip_entry(archive, &path).ok()?;
    Some((bytes, cover_format(media_type.as_deref(), &href)))
}

/// Метаданные манифеста OPF: идентификатор обложки и элементы.
fn manifest_items(opf: &[u8]) -> (Option<String>, Vec<ManifestItem>) {
    let mut reader = Reader::from_reader(opf);
    let mut buffer = Vec::new();
    let mut cover_id = None;
    let mut items = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                let name = String::from_utf8_lossy(event.name().as_ref()).to_string();
                let mut id = String::new();
                let mut href = String::new();
                let mut properties = String::new();
                let mut media_type = None;
                let mut meta_name = String::new();
                let mut meta_content = String::new();
                for attribute in event.attributes().flatten() {
                    let key = String::from_utf8_lossy(attribute.key.as_ref()).to_string();
                    let Ok(value) = attribute.unescape_value() else {
                        continue;
                    };
                    match key.as_str() {
                        "id" => id = value.into_owned(),
                        "href" => href = value.into_owned(),
                        "properties" => properties = value.into_owned(),
                        "media-type" => media_type = Some(value.into_owned()),
                        "name" => meta_name = value.into_owned(),
                        "content" => meta_content = value.into_owned(),
                        _ => {}
                    }
                }
                if name.ends_with("item") {
                    items.push(ManifestItem {
                        id,
                        href,
                        properties,
                        media_type,
                    });
                } else if name.ends_with("meta") && meta_name == "cover" {
                    cover_id = Some(meta_content);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    (cover_id, items)
}

/// Разрешение относительного пути `href` от пути OPF.
fn resolve_relative(opf_path: &str, href: &str) -> Option<String> {
    let base: Vec<&str> = opf_path.rsplitn(2, '/').nth(1).unwrap_or("").split('/').collect();
    let mut parts: Vec<String> = base
        .into_iter()
        .filter(|segment| !segment.is_empty())
        .map(str::to_string)
        .collect();
    for segment in href.split('/') {
        match segment {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            other => parts.push(other.to_string()),
        }
    }
    Some(parts.join("/"))
}

/// Формат обложки по медиатипу и расширению.
fn cover_format(media_type: Option<&str>, href: &str) -> String {
    let media = media_type.unwrap_or_default().to_ascii_lowercase();
    if media.contains("png") || href.to_ascii_lowercase().ends_with(".png") {
        "png".to_string()
    } else if media.contains("webp") || href.to_ascii_lowercase().ends_with(".webp") {
        "webp".to_string()
    } else if media.contains("gif") || href.to_ascii_lowercase().ends_with(".gif") {
        "gif".to_string()
    } else {
        "jpeg".to_string()
    }
}

/// Извлечение названия и авторов из метаданных EPUB.
pub(crate) fn parse_epub_metadata(bytes: &[u8]) -> Result<(String, Vec<String>), String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let container = archive
        .by_name("META-INF/container.xml")
        .map_err(|_| "в EPUB отсутствует container.xml".to_string())?;
    let container_text = container
        .bytes()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "не удалось прочитать container.xml".to_string())?;
    let rootfile = attribute_value(&container_text, "rootfile", "full-path")
        .or_else(|| text_between(&container_text, "full-path"))
        .ok_or_else(|| "в EPUB отсутствует content.opf".to_string())?;
    let opf = archive
        .by_name(&rootfile)
        .map_err(|_| "не удалось открыть content.opf".to_string())?;
    let opf_text = opf
        .bytes()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "не удалось прочитать content.opf".to_string())?;
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
