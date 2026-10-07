use super::*;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// Добавление записи в EPUB-архив.
fn add_file(writer: &mut ZipWriter<Cursor<Vec<u8>>>, name: &str, bytes: &[u8]) {
    writer
        .start_file(name, SimpleFileOptions::default())
        .expect("начало записи");
    writer.write_all(bytes).expect("запись файла");
}

/// Сборка минимального EPUB с главами и изображениями.
///
/// `chapters` — пары «путь главы, XHTML», `spine_order` — порядок глав в spine
/// по индексам, `images` — пары «путь, байты».
fn build_epub(
    chapters: &[(&str, &str)],
    spine_order: &[usize],
    images: &[(&str, &[u8])],
) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    add_file(
        &mut writer,
        "META-INF/container.xml",
        br#"<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
    );
    let mut manifest = String::new();
    let mut spine = String::new();
    for (index, (path, _)) in chapters.iter().enumerate() {
        manifest.push_str(&format!(
            r#"<item id="ch{index}" href="{path}" media-type="application/xhtml+xml"/>"#
        ));
    }
    for index in spine_order {
        spine.push_str(&format!(r#"<itemref idref="ch{index}"/>"#));
    }
    let opf = format!(
        r#"<?xml version="1.0"?>
<package><manifest>{manifest}</manifest><spine>{spine}</spine></package>"#
    );
    add_file(&mut writer, "OEBPS/content.opf", opf.as_bytes());
    for (path, body) in chapters {
        add_file(&mut writer, &format!("OEBPS/{path}"), body.as_bytes());
    }
    for (path, bytes) in images {
        add_file(&mut writer, &format!("OEBPS/{path}"), bytes);
    }
    writer.finish().expect("завершение архива").into_inner()
}

#[test]
fn reads_chapters_in_spine_order() {
    let chapters = [
        ("a.xhtml", "<html><body><h1>Первая</h1></body></html>"),
        ("b.xhtml", "<html><body><h1>Вторая</h1></body></html>"),
    ];
    let bytes = build_epub(&chapters, &[1, 0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert_eq!(result.len(), 2, "две главы");
    assert_eq!(result[0].title.as_deref(), Some("Вторая"));
    assert_eq!(result[1].title.as_deref(), Some("Первая"));
    assert!(
        result[0].html.contains("Вторая") && result[1].html.contains("Первая"),
        "порядок задаёт spine"
    );
}

#[test]
fn embeds_images_as_data_uri() {
    let chapters = [(
        "text/chapter.xhtml",
        r#"<html><body><p>Текст</p><img src="img/pic.png"/></body></html>"#,
    )];
    let bytes = build_epub(&chapters, &[0], &[("text/img/pic.png", &[1, 2, 3])]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(
        result[0].html.contains("data:image/png;base64,"),
        "изображение встроено как data-URI: {}",
        result[0].html
    );
    assert!(
        !result[0].html.contains("src=\"img/pic.png\""),
        "исходная ссылка заменена"
    );
}

#[test]
fn missing_image_keeps_original_source() {
    let chapters = [("chapter.xhtml", r#"<img src="missing.png"/>"#)];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(
        result[0].html.contains("src=\"missing.png\""),
        "отсутствующее изображение не ломает главу"
    );
}

#[test]
fn strips_script_blocks() {
    let chapters = [(
        "chapter.xhtml",
        r#"<p>до</p><script>alert(1)</script><p>после</p>"#,
    )];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(!result[0].html.contains("script"), "сценарии удалены");
    assert!(
        result[0].html.contains("до") && result[0].html.contains("после"),
        "текст вокруг сценария сохранён"
    );
}

#[test]
fn title_comes_from_head_title() {
    let chapters = [(
        "chapter.xhtml",
        "<html><head><title>Название</title></head><body><h1>Заголовок</h1></body></html>",
    )];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert_eq!(result[0].title.as_deref(), Some("Название"));
}

#[test]
fn chapter_html_excludes_document_wrappers() {
    let chapters = [(
        "chapter.xhtml",
        "<html><head><title>Т</title></head><body><p>Только текст</p></body></html>",
    )];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(result[0].html.contains("<p>Только текст</p>"));
    assert!(!result[0].html.contains("<html"), "обёртка html удалена");
    assert!(!result[0].html.contains("<body"), "обёртка body удалена");
}

#[test]
fn broken_archive_reports_error() {
    let result = read_epub_chapters(b"not an epub");

    assert!(result.is_err(), "некорректный EPUB даёт ошибку");
}

#[test]
fn empty_spine_reports_error() {
    let chapters = [("chapter.xhtml", "<p>текст</p>")];
    let bytes = build_epub(&chapters, &[], &[]);

    let result = read_epub_chapters(&bytes);

    assert!(result.is_err(), "отсутствие глав в spine даёт ошибку");
}
