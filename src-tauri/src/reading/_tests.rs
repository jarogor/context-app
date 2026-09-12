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
        let page =
            format!("<html xmlns=\"http://www.w3.org/1999/xhtml\"><body>{content}</body></html>");
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
