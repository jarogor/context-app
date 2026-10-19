use super::archive::{epub_cover, read_zip_entry, rootfile_path};
use super::*;
use std::io::{Cursor, Write};
use zip::write::SimpleFileOptions;
use zip::ZipArchive;
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

/// Сборка EPUB с произвольным содержимым OPF и набора файлов.
fn build_epub_with_opf(opf: &str, files: &[(&str, &[u8])]) -> Vec<u8> {
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    add_file(
        &mut writer,
        "META-INF/container.xml",
        br#"<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
    );
    add_file(&mut writer, "OEBPS/content.opf", opf.as_bytes());
    for (path, bytes) in files {
        add_file(&mut writer, &format!("OEBPS/{path}"), bytes);
    }
    writer.finish().expect("завершение архива").into_inner()
}

/// Извлечение обложки из EPUB-байтов.
fn cover_of(bytes: &[u8]) -> Option<(Vec<u8>, String)> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).expect("архив");
    let rootfile = rootfile_path(&mut archive).expect("content.opf");
    let opf = read_zip_entry(&mut archive, &rootfile).expect("чтение OPF");
    epub_cover(&mut archive, &opf, &rootfile)
}

#[test]
fn cover_from_meta_name() {
    let opf = r#"<?xml version="1.0"?>
<package><metadata><meta name="cover" content="ci"/></metadata>
<manifest>
<item id="ci" href="images/cover.png" media-type="image/png"/>
</manifest></package>"#;
    let bytes = build_epub_with_opf(opf, &[("images/cover.png", &[1, 2, 3])]);

    let (data, format) = cover_of(&bytes).expect("обложка найдена по meta name");

    assert_eq!(data, vec![1, 2, 3]);
    assert_eq!(format, "png");
}

#[test]
fn cover_from_properties() {
    let opf = r#"<?xml version="1.0"?>
<package><manifest>
<item id="x" href="images/oblozhka.jpg" media-type="image/jpeg" properties="cover-image"/>
</manifest></package>"#;
    let bytes = build_epub_with_opf(opf, &[("images/oblozhka.jpg", &[9])]);

    let (_, format) = cover_of(&bytes).expect("обложка найдена по properties");

    assert_eq!(format, "jpeg");
}

#[test]
fn cover_from_guide_reference() {
    let opf = r#"<?xml version="1.0"?>
<package>
<manifest>
<item id="coverpage" href="text/cover.xhtml" media-type="application/xhtml+xml"/>
<item id="img" href="images/front.jpg" media-type="image/jpeg"/>
</manifest>
<guide><reference type="cover" title="Cover" href="text/cover.xhtml"/></guide>
</package>"#;
    let page = br#"<html><body><img src="../images/front.jpg"/></body></html>"#;
    let bytes = build_epub_with_opf(
        opf,
        &[("text/cover.xhtml", page), ("images/front.jpg", &[7, 7])],
    );

    let (data, format) = cover_of(&bytes).expect("обложка найдена по guide");

    assert_eq!(data, vec![7, 7]);
    assert_eq!(format, "jpeg");
}

#[test]
fn cover_from_cover_named_item() {
    // Ни метаданных, ни properties, ни guide: имя файла содержит «cover».
    let opf = r#"<?xml version="1.0"?>
<package><manifest>
<item id="c1" href="images/the-cover.jpeg" media-type="image/jpeg"/>
</manifest></package>"#;
    let bytes = build_epub_with_opf(opf, &[("images/the-cover.jpeg", &[4, 5, 6])]);

    let (data, _) = cover_of(&bytes).expect("обложка найдена по имени файла");

    assert_eq!(data, vec![4, 5, 6]);
}

#[test]
fn no_cover_when_absent() {
    let opf = r#"<?xml version="1.0"?>
<package><manifest>
<item id="ch" href="text/ch.xhtml" media-type="application/xhtml+xml"/>
</manifest></package>"#;
    let bytes = build_epub_with_opf(opf, &[("text/ch.xhtml", b"<p>text</p>")]);

    assert!(
        cover_of(&bytes).is_none(),
        "обложки нет — null, а не ошибка"
    );
}
