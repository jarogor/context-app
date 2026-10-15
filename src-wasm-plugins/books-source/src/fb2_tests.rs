use base64::Engine;

use super::extract;

/// FB2 с названием, автором и встроенной обложкой.
#[test]
fn extracts_title_authors_and_cover() {
    let binary = base64::engine::general_purpose::STANDARD.encode(b"hello");
    let xml = format!(
        r##"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
 <description><title-info>
  <book-title>Моя книга</book-title>
  <author><first-name>Иван</first-name><last-name>Иванов</last-name></author>
  <coverpage><image l:href="#cover.jpg"/></coverpage>
 </title-info></description>
 <binary id="cover.jpg" content-type="image/png">{binary}</binary>
</FictionBook>"##
    );

    let metadata = extract(xml.as_bytes());

    assert_eq!(metadata.title.as_deref(), Some("Моя книга"));
    assert_eq!(metadata.authors, vec!["Иван Иванов".to_string()]);
    let (bytes, format) = metadata.cover.expect("обложка");
    assert_eq!(bytes, b"hello");
    assert_eq!(format, "png");
}

/// Не-FB2 даёт пустые метаданные.
#[test]
fn falls_back_without_metadata() {
    let metadata = extract(b"not xml");

    assert!(metadata.title.is_none());
    assert!(metadata.authors.is_empty());
    assert!(metadata.cover.is_none());
}
