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
mod tests {
    use super::*;
    use crate::test_util;
    use std::fs;
    use std::io::Write;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU32, Ordering};
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    fn temp_dir(name: &str) -> PathBuf {
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("..")
            .join("_tmp")
            .join("tests")
            .join(format!("{name}-{}", COUNTER.fetch_add(1, Ordering::SeqCst)));
        test_util::reset(&dir);
        dir
    }

    fn write_epub(path: &Path, chapters: &[(String, String)]) {
        let file = fs::File::create(path).expect("создание EPUB");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let container = "<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>";
        zip.start_file("META-INF/container.xml", options)
            .expect("container.xml");
        zip.write_all(container.as_bytes()).expect("запись");

        let mut spine_refs = String::new();
        let mut manifest_items = String::new();
        for (id, _) in chapters {
            manifest_items.push_str(&format!(
                "<item id=\"{id}\" media-type=\"application/xhtml+xml\" href=\"{id}.xhtml\"/>"
            ));
            spine_refs.push_str(&format!("<itemref idref=\"{id}\"/>"));
        }

        let opf = format!(
            r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Книга</dc:title>
  </metadata>
  <manifest>
    {manifest_items}
  </manifest>
  <spine>
    {spine_refs}
  </spine>
</package>"#
        );
        zip.start_file("OEBPS/content.opf", options)
            .expect("content.opf");
        zip.write_all(opf.as_bytes()).expect("запись");

        for (id, content) in chapters {
            let page = format!(
                "<html xmlns=\"http://www.w3.org/1999/xhtml\"><body>{content}</body></html>"
            );
            zip.start_file(format!("OEBPS/{id}.xhtml"), options)
                .expect("глава");
            zip.write_all(page.as_bytes()).expect("запись");
        }

        zip.finish().expect("завершение архива");
    }

    #[test]
    fn extracts_plain_text_from_all_chapters() {
        let dir = temp_dir("reading-chapters");
        let epub = dir.join("book.epub");
        write_epub(
            &epub,
            &[
                (
                    "c1".to_string(),
                    "<h1>Глава 1</h1><p>Первый абзац</p>".to_string(),
                ),
                (
                    "c2".to_string(),
                    "<p>Второй абзац &amp; конец</p>".to_string(),
                ),
            ],
        );

        let text = extract_book_text(&epub).expect("извлечение текста");
        assert!(text.contains("Глава 1"), "заголовок главы извлечён");
        assert!(text.contains("Первый абзац"), "текст извлечён");
        assert!(
            text.contains("Второй абзац & конец"),
            "сущности декодированы"
        );
        assert!(text.contains("\n\n"), "главы разделены");
        assert!(!text.contains('<'), "разметка удалена");

        fs::remove_dir_all(&dir).expect("очистка");
    }

    #[test]
    fn broken_epub_returns_error() {
        let dir = temp_dir("reading-broken");
        let epub = dir.join("broken.epub");
        fs::write(&epub, b"not an epub").expect("запись");

        let result = extract_book_text(&epub);
        assert!(result.is_err(), "повреждённый файл отклоняется");

        fs::remove_dir_all(&dir).expect("очистка");
    }

    #[test]
    fn strip_html_blocks_keeps_paragraph_boundaries() {
        let html = "<p>Один</p><p>Два</p>";
        let stripped = strip_html_blocks(html);
        assert!(stripped.contains("\n"), "границы абзацев сохранены");
    }
}
