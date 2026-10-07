//! Низкоуровневый доступ к архиву EPUB и манифесту OPF.

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

use crate::xml::{attribute_value, text_between};

/// Чтение записи архива EPUB.
pub(super) fn read_zip_entry(
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
pub(super) struct ManifestItem {
    /// Идентификатор элемента манифеста.
    pub(super) id: String,
    /// Путь к файлу относительно OPF.
    pub(super) href: String,
    /// Свойства элемента (например, `cover-image`).
    pub(super) properties: String,
    /// Медиатип элемента.
    pub(super) media_type: Option<String>,
}

/// Метаданные манифеста OPF: идентификатор обложки и элементы.
pub(super) fn manifest_items(opf: &[u8]) -> (Option<String>, Vec<ManifestItem>) {
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
pub(super) fn resolve_relative(opf_path: &str, href: &str) -> Option<String> {
    let directory = opf_path
        .rsplit_once('/')
        .map(|(base, _)| base)
        .unwrap_or("");
    let mut parts: Vec<String> = directory
        .split('/')
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
pub(super) fn cover_format(media_type: Option<&str>, href: &str) -> String {
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

/// Извлечение обложки EPUB из манифеста OPF.
pub(super) fn epub_cover(
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

/// Путь к OPF-файлу из `container.xml` архива.
pub(super) fn rootfile_path(archive: &mut ZipArchive<Cursor<&[u8]>>) -> Result<String, String> {
    let container = read_zip_entry(archive, "META-INF/container.xml")?;
    attribute_value(&container, "rootfile", "full-path")
        .or_else(|| text_between(&container, "full-path"))
        .ok_or_else(|| "в EPUB отсутствует content.opf".to_string())
}
