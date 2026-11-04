//! Оглавление EPUB: подписи пунктов из навигационного документа.
//!
//! Подпись главы берётся не из `<title>` её файла: у книг, собранных
//! конвертерами, `<title>` одинаков во всех файлах (часто это название книги),
//! и содержание превращалось в список повторов. Настоящее оглавление книги
//! лежит в навигационном документе — `nav` (EPUB 3) или `toc.ncx` (EPUB 2), —
//! и его подписи уникальны.
//!
//! Разбор необязателен: если оглавления нет или оно не разбирается, вызывающая
//! сторона пользуется заголовками документа.

use std::collections::HashMap;
use std::io::Cursor;

use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

use super::archive::{read_zip_entry, resolve_relative};
use crate::xml::local_name;

/// Оглавление книги: путь главы → подпись пункта.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct EpubToc {
    /// Подписи по пути файла главы (без якоря).
    entries: HashMap<String, String>,
}

impl EpubToc {
    /// Признак пустого оглавления.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    /// Подпись главы по её пути.
    ///
    /// Если у одного файла несколько пунктов (файл содержит несколько глав),
    /// берётся первый: путь адресует файл, а не пункт.
    pub fn title_for(&self, path: &str) -> Option<&str> {
        self.entries.get(path).map(String::as_str)
    }
}

/// Разбор оглавления книги.
///
/// Порядок — от точного к общему: навигационный документ EPUB 3 (`nav`), затем
/// EPUB 2 (`toc.ncx` по `spine toc`), затем `.ncx` из манифеста.
pub(super) fn read_toc(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    opf: &[u8],
    opf_path: &str,
) -> EpubToc {
    if let Some(toc) = nav_path(opf)
        .and_then(|href| resolve_relative(opf_path, &href))
        .and_then(|path| read_zip_entry(archive, &path).ok())
        .map(|bytes| parse_nav(&String::from_utf8_lossy(&bytes), opf_path))
        .filter(|toc| !toc.is_empty())
    {
        return toc;
    }
    for candidate in ncx_paths(opf) {
        let Some(path) = resolve_relative(opf_path, &candidate) else {
            continue;
        };
        let Ok(bytes) = read_zip_entry(archive, &path) else {
            continue;
        };
        let toc = parse_ncx(&String::from_utf8_lossy(&bytes), opf_path);
        if !toc.is_empty() {
            return toc;
        }
    }
    EpubToc::default()
}

/// Путь навигационного документа EPUB 3 (`properties="nav"`).
fn nav_path(opf: &[u8]) -> Option<String> {
    manifest_items_with_property(opf, "nav")
}

/// Пути возможных `toc.ncx`: по `spine toc` и по манифесту.
fn ncx_paths(opf: &[u8]) -> Vec<String> {
    let mut paths = Vec::new();
    if let Some(id) = spine_toc_id(opf) {
        if let Some(href) = manifest_href_by_id(opf, &id) {
            paths.push(href);
        }
    }
    paths.extend(manifest_items_with_media_type(
        opf,
        "application/x-dtbncx+xml",
    ));
    paths
}

/// Элементы манифеста с заданным свойством (`properties="nav"`).
fn manifest_items_with_property(opf: &[u8], property: &str) -> Option<String> {
    for event in manifest_events(opf) {
        let properties = attribute(&event, "properties").unwrap_or_default();
        if properties.split_whitespace().any(|value| value == property) {
            return attribute(&event, "href");
        }
    }
    None
}

/// Элементы манифеста с заданным медиатипом.
fn manifest_items_with_media_type(opf: &[u8], media_type: &str) -> Vec<String> {
    let mut hrefs = Vec::new();
    for event in manifest_events(opf) {
        if attribute(&event, "media-type").as_deref() == Some(media_type) {
            if let Some(href) = attribute(&event, "href") {
                hrefs.push(href);
            }
        }
    }
    hrefs
}

/// Идентификатор оглавления из `<spine toc="…">`.
fn spine_toc_id(opf: &[u8]) -> Option<String> {
    let mut reader = Reader::from_reader(opf);
    let mut buffer = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if local_name(event.name().as_ref()) == "spine" {
                    if let Some(id) = attribute(&event, "toc") {
                        return Some(id);
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

/// `href` элемента манифеста по его идентификатору.
fn manifest_href_by_id(opf: &[u8], id: &str) -> Option<String> {
    for event in manifest_events(opf) {
        if attribute(&event, "id").as_deref() == Some(id) {
            return attribute(&event, "href");
        }
    }
    None
}

/// Элементы манифеста OPF.
fn manifest_events(opf: &[u8]) -> Vec<quick_xml::events::BytesStart<'static>> {
    let mut reader = Reader::from_reader(opf);
    let mut buffer = Vec::new();
    let mut events = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                let name = local_name(event.name().as_ref());
                if name == "item" || name == "itemref" {
                    events.push(event.into_owned());
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    events
}

/// Значение атрибута по локальному имени.
fn attribute(event: &quick_xml::events::BytesStart, key: &str) -> Option<String> {
    event.attributes().flatten().find_map(|attribute| {
        if local_name(attribute.key.as_ref()) == key {
            attribute
                .unescape_value()
                .ok()
                .map(|value| value.into_owned())
        } else {
            None
        }
    })
}

/// Разбор навигационного документа EPUB 3: первый `nav` с типом `toc`.
///
/// Если тип не указан, берётся первый `nav` документа: у части книг он один.
fn parse_nav(source: &str, opf_path: &str) -> EpubToc {
    let mut toc = EpubToc::default();
    let mut reader = Reader::from_reader(source.as_bytes());
    let mut buffer = Vec::new();
    // Глубина вложенности nav: подписи собираются только внутри оглавления.
    let mut nav_depth = 0usize;
    let mut toc_nav = false;
    let mut link_href: Option<String> = None;
    let mut link_text = String::new();
    let mut text_depth = 0usize;
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                match local_name(event.name().as_ref()).as_str() {
                    "nav" => {
                        let kind = attribute(&event, "type").unwrap_or_default();
                        let has_toc = kind.split_whitespace().any(|value| value == "toc");
                        nav_depth += 1;
                        // Оглавление — первый nav типа toc, иначе первый nav.
                        if nav_depth == 1 && (has_toc || (kind.is_empty() && toc.is_empty())) {
                            toc_nav = true;
                        }
                    }
                    "a" if nav_depth > 0 && toc_nav => {
                        link_href = attribute(&event, "href");
                        link_text.clear();
                        text_depth = 1;
                    }
                    _ if text_depth > 0 => {
                        text_depth += 1;
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(event)) if text_depth > 0 => {
                if let Ok(value) = event.unescape() {
                    link_text.push_str(&value);
                }
            }
            Ok(Event::End(event)) => match local_name(event.name().as_ref()).as_str() {
                "a" if text_depth > 0 => {
                    text_depth = 0;
                    if let (Some(href), Some(title)) =
                        (link_href.take(), normalize_title(&link_text))
                    {
                        toc.insert(opf_path, &href, &title);
                    }
                    link_text.clear();
                }
                "nav" if nav_depth > 0 => {
                    nav_depth -= 1;
                    if nav_depth == 0 {
                        toc_nav = false;
                    }
                }
                _ if text_depth > 0 => {
                    text_depth -= 1;
                }
                _ => {}
            },
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    toc
}

/// Разбор оглавления EPUB 2 (`toc.ncx`): пары `navLabel/text` и `content/src`.
fn parse_ncx(source: &str, opf_path: &str) -> EpubToc {
    let mut toc = EpubToc::default();
    let mut reader = Reader::from_reader(source.as_bytes());
    let mut buffer = Vec::new();
    let mut pending_title: Option<String> = None;
    let mut label_text = String::new();
    let mut in_label = false;
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                match local_name(event.name().as_ref()).as_str() {
                    "navlabel" => in_label = true,
                    "text" if in_label => label_text.clear(),
                    "content" => {
                        // `content` идёт после `navLabel` того же пункта.
                        if let (Some(title), Some(src)) =
                            (pending_title.take(), attribute(&event, "src"))
                        {
                            toc.insert(opf_path, &src, &title);
                        }
                    }
                    _ => {}
                }
            }
            Ok(Event::Empty(event)) => {
                if local_name(event.name().as_ref()) == "content" {
                    if let (Some(title), Some(src)) =
                        (pending_title.take(), attribute(&event, "src"))
                    {
                        toc.insert(opf_path, &src, &title);
                    }
                }
            }
            Ok(Event::Text(event)) if in_label => {
                if let Ok(value) = event.unescape() {
                    label_text.push_str(&value);
                }
            }
            Ok(Event::End(event)) => {
                if local_name(event.name().as_ref()) == "navlabel" {
                    in_label = false;
                    pending_title = normalize_title(&label_text);
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    toc
}

impl EpubToc {
    /// Добавление подписи по ссылке оглавления.
    ///
    /// Ссылка может быть относительной (тогда путь разрешается от `opf`) или
    /// содержать якорь (тогда он отбрасывается: подпись принадлежит файлу).
    fn insert(&mut self, opf_path: &str, href: &str, title: &str) {
        let Some(path) = resolve_href(opf_path, href) else {
            return;
        };
        // Первая подпись файла побеждает: следующий пункт того же файла — уже
        // другая глава внутри него, а путь адресует файл.
        self.entries
            .entry(path)
            .or_insert_with(|| title.to_string());
    }
}

/// Путь файла из ссылки оглавления (без якоря и запроса).
fn resolve_href(opf_path: &str, href: &str) -> Option<String> {
    let value = href.trim();
    if value.is_empty() || value.starts_with("http:") || value.starts_with("https:") {
        return None;
    }
    let without_fragment = value.split('#').next().unwrap_or(value);
    let without_query = without_fragment
        .split('?')
        .next()
        .unwrap_or(without_fragment);
    let path = if without_query.is_empty() {
        // Ссылка только с якорем: она ведёт в тот же файл, что и OPF не задаёт.
        return None;
    } else {
        without_query
    };
    resolve_relative(opf_path, path)
}

/// Подпись пункта без лишних пробелов и переводов строк.
fn normalize_title(value: &str) -> Option<String> {
    let title = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        None
    } else {
        Some(title)
    }
}

#[cfg(test)]
#[path = "toc_tests.rs"]
mod tests;
