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

/// Свойства издания: язык, дата, издатель, ISBN и описание из аннотации.
#[test]
fn extracts_publication_properties() {
    let xml = r#"<?xml version="1.0"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0">
 <description>
  <title-info>
   <book-title>Книга</book-title>
   <annotation><p>Краткое <emphasis>описание</emphasis>.</p></annotation>
   <date>2001</date>
   <lang>ru</lang>
  </title-info>
  <document-info><isbn>978-5-00000-000-0</isbn></document-info>
  <publish-info><publisher>Издательство</publisher></publish-info>
 </description>
</FictionBook>"#;

    let metadata = extract(xml.as_bytes());

    assert_eq!(metadata.language.as_deref(), Some("ru"));
    assert_eq!(metadata.published.as_deref(), Some("2001"));
    assert_eq!(metadata.publisher.as_deref(), Some("Издательство"));
    assert_eq!(metadata.identifier.as_deref(), Some("978-5-00000-000-0"));
    assert_eq!(metadata.description.as_deref(), Some("Краткое описание."));
}
