//! Тесты разбора метаданных `metadata.opf`.

use std::fs;

use super::parse;
use crate::test_util;

/// Разбор OPF извлекает название, авторов, теги, язык, обложку и серию.
#[test]
fn parses_opf_metadata() {
    let root = test_util::test_root("calibre-metadata");
    test_util::cleanup(&root);
    fs::create_dir_all(&root).expect("создание каталога теста");
    let path = root.join("metadata.opf");
    fs::write(
        &path,
        r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
                <dc:title>Название</dc:title>
                <dc:creator>Автор 1</dc:creator>
                <dc:creator>Автор 2</dc:creator>
                <dc:subject>Фантастика</dc:subject>
                <dc:language>ru</dc:language>
                <meta name="cover" content="cover.png"/>
                <meta name="calibre:series" content="Серия"/>
                <meta name="calibre:series_index" content="2"/>
            </metadata></package>"#,
    )
    .expect("запись OPF");

    let metadata = parse(&path).expect("разбор OPF");

    assert_eq!(metadata.title.as_deref(), Some("Название"));
    assert_eq!(metadata.authors, ["Автор 1", "Автор 2"]);
    assert_eq!(metadata.tags, ["Фантастика"]);
    assert_eq!(metadata.language.as_deref(), Some("ru"));
    assert_eq!(metadata.cover.as_deref(), Some("cover.png"));
    assert_eq!(metadata.series, Some(("Серия".to_string(), 2)));

    test_util::cleanup(&root);
}
