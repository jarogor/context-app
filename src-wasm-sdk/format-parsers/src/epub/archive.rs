//! Низкоуровневый доступ к архиву EPUB и манифесту OPF.

use std::io::{Cursor, Read};

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

use crate::xml::{attribute_value, local_name, text_between};

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
pub struct ManifestItem {
    /// Идентификатор элемента манифеста.
    pub id: String,
    /// Путь к файлу относительно OPF.
    pub href: String,
    /// Свойства элемента (например, `cover-image`).
    pub properties: String,
    /// Медиатип элемента.
    pub media_type: Option<String>,
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
///
/// Обложка ищется по стандартам EPUB в порядке надёжности:
/// 1. `<meta name="cover" content="id">` (EPUB 2);
/// 2. элемент манифеста с `properties="cover-image"` (EPUB 3);
/// 3. `guide`/`reference type="cover"` со ссылкой на страницу обложки, из
///    которой берётся первое изображение;
/// 4. элемент манифеста, чей `id` или `href` содержит `cover`.
///
/// Последние два фолбэка нужны реальным книгам: часть из них не помечает
/// обложку ни метаданными, ни свойством, и без этого обложка не находилась.
pub(super) fn epub_cover(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    opf: &[u8],
    opf_path: &str,
) -> Option<(Vec<u8>, String)> {
    let (cover_id, items) = manifest_items(opf);
    let by_id = cover_id
        .as_ref()
        .and_then(|id| items.iter().find(|item| &item.id == id));
    let by_property = items
        .iter()
        .find(|item| item.properties.contains("cover-image"));
    let by_href = items.iter().find(|item| has_cover_in_name(&item.href));
    let by_id_name = items
        .iter()
        .find(|item| item.id.to_lowercase().contains("cover"));

    // 1–2: явная метка обложки.
    if let Some(item) = by_id.or(by_property) {
        if let Some(cover) = read_cover_item(archive, opf_path, item) {
            return Some(cover);
        }
    }
    // 3: страница обложки из guide — берём первое изображение в ней.
    if let Some(cover) = cover_from_guide(archive, opf, opf_path) {
        return Some(cover);
    }
    // 4: имя элемента или файла содержит «cover».
    for item in [by_href, by_id_name].into_iter().flatten() {
        if is_image_item(item) {
            if let Some(cover) = read_cover_item(archive, opf_path, item) {
                return Some(cover);
            }
        }
    }
    None
}

/// Чтение обложки по элементу манифеста.
fn read_cover_item(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    opf_path: &str,
    item: &ManifestItem,
) -> Option<(Vec<u8>, String)> {
    let path = resolve_relative(opf_path, &item.href)?;
    let bytes = read_zip_entry(archive, &path).ok()?;
    Some((bytes, cover_format(item.media_type.as_deref(), &item.href)))
}

/// Изображение ли элемент манифеста по медиатипу.
fn is_image_item(item: &ManifestItem) -> bool {
    item.media_type
        .as_deref()
        .unwrap_or_default()
        .starts_with("image/")
}

/// Есть ли «cover» в имени файла.
fn has_cover_in_name(href: &str) -> bool {
    href.rsplit('/')
        .next()
        .unwrap_or(href)
        .to_ascii_lowercase()
        .contains("cover")
}

/// Обложка со страницы `guide`/`reference type="cover"`.
///
/// Часть книг описывает обложку отдельной XHTML-страницей в `guide`; берём из
/// неё первое изображение манифеста.
fn cover_from_guide(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    opf: &[u8],
    opf_path: &str,
) -> Option<(Vec<u8>, String)> {
    let (_, items) = manifest_items(opf);
    let cover_href = guide_cover_href(opf)?;
    let page_path = resolve_relative(opf_path, &cover_href)?;
    let page = read_zip_entry(archive, &page_path).ok()?;
    let image_src = first_image_src(&page)?;
    let image_href = resolve_relative(&page_path, &image_src)?;
    // Медиатип ищем в манифесте по разрешённому пути; иначе по расширению.
    let media_type = items
        .iter()
        .find(|item| resolve_relative(opf_path, &item.href).as_deref() == Some(image_href.as_str()))
        .and_then(|item| item.media_type.clone());
    let bytes = read_zip_entry(archive, &image_href).ok()?;
    Some((bytes, cover_format(media_type.as_deref(), &image_href)))
}

/// Путь обложки из `guide`/`reference type="cover"`.
fn guide_cover_href(opf: &[u8]) -> Option<String> {
    let mut reader = Reader::from_reader(opf);
    let mut buffer = Vec::new();
    let mut in_guide = false;
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                let name = local_name(event.name().as_ref());
                if name == "guide" {
                    in_guide = true;
                } else if in_guide && name == "reference" {
                    let mut kind = String::new();
                    let mut href = String::new();
                    for attribute in event.attributes().flatten() {
                        match attribute.key.as_ref() {
                            b"type" => {
                                if let Ok(value) = attribute.unescape_value() {
                                    kind = value.into_owned();
                                }
                            }
                            b"href" => {
                                if let Ok(value) = attribute.unescape_value() {
                                    href = value.into_owned();
                                }
                            }
                            _ => {}
                        }
                    }
                    if kind == "cover" && !href.is_empty() {
                        return Some(href);
                    }
                }
            }
            Ok(Event::End(event)) => {
                if local_name(event.name().as_ref()) == "guide" {
                    in_guide = false;
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

/// Первый `src` изображения на XHTML-странице.
fn first_image_src(page: &[u8]) -> Option<String> {
    let mut reader = Reader::from_reader(page);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if local_name(event.name().as_ref()) == "img" {
                    for attribute in event.attributes().flatten() {
                        if attribute.key.as_ref() == b"src" {
                            if let Ok(value) = attribute.unescape_value() {
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

/// Путь к OPF-файлу из `container.xml` архива.
pub(super) fn rootfile_path(archive: &mut ZipArchive<Cursor<&[u8]>>) -> Result<String, String> {
    let container = read_zip_entry(archive, "META-INF/container.xml")?;
    attribute_value(&container, "rootfile", "full-path")
        .or_else(|| text_between(&container, "full-path"))
        .ok_or_else(|| "в EPUB отсутствует content.opf".to_string())
}
