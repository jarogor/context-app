//! Чтение книг: извлечение текстового содержимого EPUB для read-view.

pub mod error;

pub use error::ReadingError;

use std::path::Path;

/// Извлечение всего текста книги из файла EPUB.
///
/// Последовательно проходится spine (линейные главы), из каждого документа
/// удаляется разметка HTML, главы разделяются переводом строки.
pub fn extract_book_text(epub_path: &Path) -> Result<String, ReadingError> {
    let mut doc = epub::doc::EpubDoc::new(epub_path)
        .map_err(|_| ReadingError::InvalidEpub(epub_path.to_path_buf()))?;

    let resource_ids = doc
        .spine
        .iter()
        .filter(|item| item.linear)
        .map(|item| item.id.clone().unwrap_or_else(|| item.idref.clone()))
        .collect::<Vec<_>>();

    let mut chapters: Vec<String> = Vec::new();
    for id in &resource_ids {
        if let Some((content, _mime)) = doc.get_resource_str(id) {
            chapters.push(strip_html_blocks(&content));
        }
    }

    let text = chapters
        .into_iter()
        .filter(|chapter| !chapter.trim().is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(text)
}

/// Удаление HTML-разметки с сохранением границ абзацев.
///
/// Блочные теги заменяются переводом строки, после чего все теги
/// вырезаются, а сущности заменяются базовыми символами.
fn strip_html_blocks(html: &str) -> String {
    let mut output = String::with_capacity(html.len());
    let mut rest = html;

    while let Some(lt) = rest.find('<') {
        output.push_str(&rest[..lt]);
        let tail = &rest[lt..];
        let gt = tail.find('>').map(|i| i + 1).unwrap_or(tail.len());
        let tag = &tail[1..gt.saturating_sub(1)];
        if is_block_break(tag) {
            output.push('\n');
        }
        rest = &tail[gt..];
    }
    output.push_str(rest);

    decode_entities(&output)
}

/// Проверка, что тег задаёт границу блока.
fn is_block_break(tag: &str) -> bool {
    let name = tag
        .trim_start_matches('/')
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_end_matches('/');
    matches!(
        name,
        "p" | "div"
            | "section"
            | "article"
            | "aside"
            | "blockquote"
            | "li"
            | "ul"
            | "ol"
            | "tr"
            | "table"
            | "h1"
            | "h2"
            | "h3"
            | "h4"
            | "h5"
            | "h6"
            | "br"
    )
}

/// Замена основных HTML-сущностей.
fn decode_entities(input: &str) -> String {
    input
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#160;", " ")
}

#[cfg(test)]
#[path = "_tests.rs"]
mod tests;
