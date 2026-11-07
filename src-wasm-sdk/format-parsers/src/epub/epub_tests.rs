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
fn title_prefers_heading_over_document_title() {
    // `<title>` у книг от конвертеров одинаков во всех главах (часто это
    // название книги), поэтому подписью главы служит первый заголовок текста.
    let chapters = [(
        "chapter.xhtml",
        "<html><head><title>Название книги</title></head><body><h1>Заголовок главы</h1></body></html>",
    )];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert_eq!(result[0].title.as_deref(), Some("Заголовок главы"));
}

#[test]
fn title_falls_back_to_document_title() {
    let chapters = [(
        "chapter.xhtml",
        "<html><head><title>Только заголовок</title></head><body><p>Текст</p></body></html>",
    )];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert_eq!(result[0].title.as_deref(), Some("Только заголовок"));
}

#[test]
fn chapter_titles_come_from_navigation() {
    // Книга конвертера: одинаковый `<title>` во всех файлах, а настоящие
    // подписи — в навигационном документе EPUB 3. Раньше содержание выходило
    // списком повторов одного названия.
    let chapters = [
        (
            "ch1.xhtml",
            "<html><head><title>Название книги</title></head><body><p>Первая</p></body></html>",
        ),
        (
            "ch2.xhtml",
            "<html><head><title>Название книги</title></head><body><p>Вторая</p></body></html>",
        ),
    ];
    let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
    add_file(
        &mut writer,
        "META-INF/container.xml",
        br#"<?xml version="1.0"?>
<container><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>"#,
    );
    let opf = r#"<?xml version="1.0"?>
<package><manifest>
  <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
</manifest><spine><itemref idref="ch1"/><itemref idref="ch2"/></spine></package>"#;
    add_file(&mut writer, "OEBPS/content.opf", opf.as_bytes());
    let nav = r#"<html><body><nav epub:type="toc"><ol>
      <li><a href="ch1.xhtml">Предисловие</a></li>
      <li><a href="ch2.xhtml">Основная часть</a></li>
    </ol></nav></body></html>"#;
    add_file(&mut writer, "OEBPS/nav.xhtml", nav.as_bytes());
    for (path, body) in chapters {
        add_file(&mut writer, &format!("OEBPS/{path}"), body.as_bytes());
    }
    let bytes = writer.finish().expect("архив").into_inner();

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert_eq!(result[0].title.as_deref(), Some("Предисловие"));
    assert_eq!(result[1].title.as_deref(), Some("Основная часть"));
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

/// Сборка EPUB с общей таблицей стилей и одной главой.
///
/// CSS объявлен в манифесте, как в настоящей книге: оформление собирается по
/// манифесту, а не по упоминаниям в главах.
fn build_epub_with_css(css: &str, chapter: &str) -> Vec<u8> {
    let opf = r#"<?xml version="1.0"?>
<package><manifest>
<item id="ch0" href="chapter.xhtml" media-type="application/xhtml+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
</manifest><spine><itemref idref="ch0"/></spine></package>"#;
    build_epub_with_opf(
        opf,
        &[
            ("chapter.xhtml", chapter.as_bytes()),
            ("style.css", css.as_bytes()),
        ],
    )
}

#[test]
fn chapter_carries_book_style() {
    // Конвертированные книги держат вёрстку в классах и общем CSS: без него
    // глава выглядела ровным текстом.
    let bytes = build_epub_with_css(
        ".calibre1 { font-size: 2em; text-align: center; } .calibre2 { text-indent: 1.5em; }",
        r#"<html><body><h1 class="calibre1">Заголовок</h1><p class="calibre2">Абзац</p></body></html>"#,
    );

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(result[0].html.contains("<style>"), "стиль встроен в главу");
    assert!(
        result[0].html.contains(".calibre1"),
        "правило заголовка сохранено"
    );
    assert!(
        result[0].html.contains("text-indent:1.5em"),
        "отступ абзаца сохранён"
    );
}

#[test]
fn chapter_drops_unsafe_book_style() {
    let bytes = build_epub_with_css(
        "body { color: red; background: black; } p { position: absolute; float: left; width: 100px; }",
        "<p>Текст</p>",
    );

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(
        !result[0].html.contains("color:red"),
        "цвет задаёт тема: {}",
        result[0].html
    );
    assert!(
        !result[0].html.contains("position:absolute"),
        "позиционирование отброшено"
    );
}

#[test]
fn chapter_without_book_style_has_no_style_block() {
    let chapters = [("chapter.xhtml", "<p>Текст</p>")];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(
        !result[0].html.contains("<style>"),
        "пустой стиль не встраивается"
    );
}

#[test]
fn chapter_inline_style_is_kept() {
    let chapters = [(
        "chapter.xhtml",
        "<style>p{text-indent:2em}</style><p>Текст</p>",
    )];
    let bytes = build_epub(&chapters, &[0], &[]);

    let result = read_epub_chapters(&bytes).expect("разбор глав");

    assert!(
        result[0].html.contains("text-indent:2em"),
        "свой стиль главы сохранён"
    );
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

#[test]
fn extracts_publication_properties() {
    let opf = r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" xmlns:dc="http://purl.org/dc/elements/1.1/">
 <metadata>
  <dc:title>Книга</dc:title>
  <dc:creator>Автор</dc:creator>
  <dc:language>ru</dc:language>
  <dc:date>2019-05-01</dc:date>
  <dc:publisher>Издательство</dc:publisher>
  <dc:description>&lt;p&gt;Описание книги&lt;/p&gt;</dc:description>
  <dc:identifier>uuid:1234</dc:identifier>
  <dc:identifier>urn:isbn:978-5-00000-000-0</dc:identifier>
 </metadata>
</package>"#;
    let bytes = build_epub_with_opf(opf, &[]);

    let metadata = extract(&bytes).expect("метаданные");

    // Свойства издания берутся из OPF, а ISBN предпочитается прочим идентификаторам.
    assert_eq!(metadata.language.as_deref(), Some("ru"));
    assert_eq!(metadata.published.as_deref(), Some("2019-05-01"));
    assert_eq!(metadata.publisher.as_deref(), Some("Издательство"));
    assert_eq!(metadata.description.as_deref(), Some("Описание книги"));
    assert_eq!(
        metadata.identifier.as_deref(),
        Some("urn:isbn:978-5-00000-000-0")
    );
}
