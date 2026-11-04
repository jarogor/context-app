//! Извлечение глав EPUB для рабочей страницы чтения.

use std::io::Cursor;

use quick_xml::events::Event;
use quick_xml::Reader;
use serde::Serialize;
use zip::ZipArchive;

use super::archive::{
    cover_format, manifest_items, read_zip_entry, resolve_relative, rootfile_path, ManifestItem,
};
use super::style::{book_style, inline_styles};
use super::toc::{read_toc, EpubToc};
use crate::xml::strip_markup;

/// Глава EPUB для рабочей страницы чтения.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EpubChapter {
    /// Заголовок главы, если найден.
    pub title: Option<String>,
    /// Внутренний HTML главы с изображениями в data-URI.
    pub html: String,
}

/// Извлечение глав EPUB в порядке spine с изображениями в data-URI.
///
/// Порядок глав задаётся spine OPF, а не порядком записей архива. Изображения
/// главы, доступные внутри EPUB, встраиваются в HTML как `data:`-URI, поэтому
/// странице чтения не нужен доступ к архиву. Сценарии `<script>` удаляются, а
/// издательский CSS книги очищается и встраивается в каждую главу: без него
/// вёрстка книги (заголовки, отступы, курсив, таблицы) терялась.
pub fn read_epub_chapters(bytes: &[u8]) -> Result<Vec<EpubChapter>, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let rootfile = rootfile_path(&mut archive)?;
    let opf = read_zip_entry(&mut archive, &rootfile)?;
    let (_, items) = manifest_items(&opf);
    // Оформление собирается один раз на книгу: главы ссылаются на общий CSS.
    let sources = style_sources(&mut archive, &rootfile, &items);
    let style = book_style(&sources).css;
    // Оглавление книги: подписи пунктов уникальны, тогда как `<title>` файла
    // главы у многих книг одинаков во всех главах.
    let toc = read_toc(&mut archive, &opf, &rootfile);
    let chapters = spine_ids(&opf)
        .into_iter()
        .filter_map(|idref| {
            let item = items.iter().find(|item| item.id == idref)?;
            if item
                .media_type
                .as_deref()
                .is_some_and(|media| !media.contains("html"))
            {
                return None;
            }
            let path = resolve_relative(&rootfile, &item.href)?;
            let raw = read_zip_entry(&mut archive, &path).ok()?;
            let source = String::from_utf8_lossy(&raw).into_owned();
            let body = body_content(&source);
            let html = embed_images(&mut archive, &path, &body);
            let html = strip_scripts(&html);
            Some(EpubChapter {
                title: toc_title(&toc, &path).or_else(|| chapter_title(&source)),
                html: with_style(&html, &style, &inline_styles(&source)),
            })
        })
        .collect::<Vec<_>>();
    if chapters.is_empty() {
        return Err("в EPUB нет читаемых глав".to_string());
    }
    Ok(chapters)
}

/// Стили книги из манифеста: внешние CSS-файлы и `<style>` глав.
///
/// Ссылки на CSS берутся из манифеста, поэтому оформление собирается даже для
/// файлов, на которые главы ссылаются через `<link>`, а не напрямую. Порядок
/// источников — порядок манифеста: так сохраняется приоритет издателя.
fn style_sources(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    rootfile: &str,
    items: &[ManifestItem],
) -> Vec<(String, String)> {
    let mut sources: Vec<(String, String)> = Vec::new();
    for item in items {
        let is_style = item
            .media_type
            .as_deref()
            .is_some_and(|media| media.contains("css"))
            || item.href.to_ascii_lowercase().ends_with(".css");
        if !is_style {
            continue;
        }
        let Some(path) = resolve_relative(rootfile, &item.href) else {
            continue;
        };
        let Ok(bytes) = read_zip_entry(archive, &path) else {
            continue;
        };
        sources.push((path, String::from_utf8_lossy(&bytes).into_owned()));
    }
    sources
}

/// Встраивание очищенного оформления книги в главу.
///
/// Своё оформление главы (`<style>`) идёт после общего: правила самой главы
/// уточняют книгу. Стили уже очищены, поэтому в документ попадают только
/// безопасные свойства.
fn with_style(html: &str, book: &str, inline: &[String]) -> String {
    let mut css = String::new();
    for source in inline {
        let cleaned = super::style::sanitize_css(source);
        if cleaned.is_empty() {
            continue;
        }
        if !css.is_empty() {
            css.push('\n');
        }
        css.push_str(&cleaned);
    }
    if book.is_empty() && css.is_empty() {
        return html.to_string();
    }
    let mut style = String::from("<style>");
    if !book.is_empty() {
        style.push_str(book);
    }
    if !css.is_empty() {
        if !book.is_empty() {
            style.push('\n');
        }
        style.push_str(&css);
    }
    style.push_str("</style>");
    format!("{style}{html}")
}

/// Порядок идентификаторов элементов spine OPF.
fn spine_ids(opf: &[u8]) -> Vec<String> {
    let mut reader = Reader::from_reader(opf);
    let mut buffer = Vec::new();
    let mut ids = Vec::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) | Ok(Event::Empty(event)) => {
                if String::from_utf8_lossy(event.name().as_ref()).ends_with("itemref") {
                    for attribute in event.attributes().flatten() {
                        let key = String::from_utf8_lossy(attribute.key.as_ref()).to_string();
                        if key.ends_with("idref") {
                            if let Ok(value) = attribute.unescape_value() {
                                ids.push(value.into_owned());
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
    ids
}

/// Встраивание изображений главы как `data:`-URI.
fn embed_images(archive: &mut ZipArchive<Cursor<&[u8]>>, chapter_path: &str, html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut result = String::with_capacity(html.len());
    let mut cursor = 0;
    while let Some(relative) = lower[cursor..].find("<img") {
        let start = cursor + relative;
        let Some(tag_end) = lower[start..].find('>') else {
            break;
        };
        let end = start + tag_end + 1;
        result.push_str(&html[cursor..start]);
        result.push_str(&replace_image_source(
            archive,
            chapter_path,
            &html[start..end],
        ));
        cursor = end;
    }
    result.push_str(&html[cursor..]);
    result
}

/// Замена `src` тега изображения на `data:`-URI содержимого из EPUB.
fn replace_image_source(
    archive: &mut ZipArchive<Cursor<&[u8]>>,
    chapter_path: &str,
    tag: &str,
) -> String {
    let Some((source, start, end)) = attribute_value_span(tag, "src") else {
        return tag.to_string();
    };
    let lowered = source.to_ascii_lowercase();
    if lowered.starts_with("data:") || lowered.starts_with("http:") || lowered.starts_with("https:")
    {
        return tag.to_string();
    }
    let Some(path) = resolve_relative(chapter_path, &source) else {
        return tag.to_string();
    };
    let Ok(bytes) = read_zip_entry(archive, &path) else {
        return tag.to_string();
    };
    let uri = image_data_uri(&bytes, &path);
    format!("{}{}{}", &tag[..start], uri, &tag[end..])
}

/// `data:`-URI для байтов изображения по расширению пути.
fn image_data_uri(bytes: &[u8], path: &str) -> String {
    let mime = match cover_format(None, path).as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    format!("data:{mime};base64,{encoded}")
}

/// Позиция значения атрибута `name` внутри тега.
///
/// Возвращает значение и границы его содержимого (без кавычек).
fn attribute_value_span(tag: &str, name: &str) -> Option<(String, usize, usize)> {
    let lower = tag.to_ascii_lowercase();
    let bytes = tag.as_bytes();
    let mut search_from = 0;
    while let Some(relative) = lower[search_from..].find(name) {
        let index = search_from + relative;
        let boundary_ok = index == 0 || !bytes[index - 1].is_ascii_alphanumeric();
        if !boundary_ok {
            search_from = index + name.len();
            continue;
        }
        let mut cursor = index + name.len();
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            search_from = index + name.len();
            continue;
        }
        cursor += 1;
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor >= bytes.len() {
            return None;
        }
        let quote = bytes[cursor];
        if quote != b'"' && quote != b'\'' {
            return None;
        }
        let value_start = cursor + 1;
        let value_end = tag[value_start..].find(quote as char)? + value_start;
        return Some((
            tag[value_start..value_end].to_string(),
            value_start,
            value_end,
        ));
    }
    None
}

/// Удаление блоков `<script>` из HTML.
fn strip_scripts(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let mut result = String::with_capacity(html.len());
    let mut cursor = 0;
    let closing = "</script>";
    while let Some(relative) = lower[cursor..].find("<script") {
        let start = cursor + relative;
        result.push_str(&html[cursor..start]);
        let Some(relative_close) = lower[start..].find(closing) else {
            return result;
        };
        cursor = start + relative_close + closing.len();
    }
    result.push_str(&html[cursor..]);
    result
}

/// Внутреннее содержимое `<body>` главы без обёрток документа.
fn body_content(html: &str) -> String {
    let lower = html.to_ascii_lowercase();
    let Some(body_start) = lower.find("<body") else {
        return html.to_string();
    };
    let Some(open_end) = lower[body_start..].find('>') else {
        return html.to_string();
    };
    let content_start = body_start + open_end + 1;
    let Some(close) = lower[content_start..].find("</body>") else {
        return html[content_start..].to_string();
    };
    html[content_start..content_start + close].to_string()
}

/// Подпись главы из оглавления книги.
fn toc_title(toc: &EpubToc, path: &str) -> Option<String> {
    toc.title_for(path).map(str::to_string)
}

/// Заголовок главы документа: первый заголовок, затем `<title>`.
///
/// `<title>` стоит последним: у книг от конвертеров он одинаков во всех файлах
/// (нередко это название книги), и как подпись главы он бесполезен. Заголовок
/// внутри текста — настоящий, а оглавление книги (если оно есть) уже проверено
/// вызывающей стороной раньше.
fn chapter_title(html: &str) -> Option<String> {
    for tag in ["h1", "h2", "h3"] {
        if let Some(text) = element_text(html, tag).filter(|value| !value.is_empty()) {
            return Some(text);
        }
    }
    element_text(html, "title").filter(|value| !value.is_empty())
}

/// Текст первого элемента с указанным тегом, без разметки.
fn element_text(html: &str, tag: &str) -> Option<String> {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{tag}");
    let start = lower.find(&open)?;
    let content_start = lower[start..].find('>')? + start + 1;
    let close = format!("</{tag}>");
    let content_end = lower[content_start..].find(&close)? + content_start;
    Some(strip_markup(&html[content_start..content_end]))
}
