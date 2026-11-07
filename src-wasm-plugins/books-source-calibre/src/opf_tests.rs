use super::extract;

/// `metadata.opf` с названием, авторами и серией.
#[test]
fn extracts_title_creators_and_series() {
    let xml = r#"<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
    <dc:title>Исследование о природе и причинах богатства народов</dc:title>
    <dc:creator opf:role="aut">Адам Смит</dc:creator>
    <dc:creator opf:role="aut">Второй Автор</dc:creator>
    <meta name="calibre:series" content="Классика"/>
    <meta name="calibre:series_index" content="3"/>
  </metadata>
</package>"#;

    let metadata = extract(xml.as_bytes());

    assert_eq!(
        metadata.title.as_deref(),
        Some("Исследование о природе и причинах богатства народов")
    );
    assert_eq!(metadata.authors, vec!["Адам Смит", "Второй Автор"]);
    assert_eq!(metadata.series, Some(("Классика".to_string(), 3)));
}

/// Не-OPF даёт пустые метаданные.
#[test]
fn falls_back_without_metadata() {
    let metadata = extract(b"not xml");

    assert!(metadata.title.is_none());
    assert!(metadata.authors.is_empty());
    assert!(metadata.series.is_none());
}

/// Свойства издания и теги из `metadata.opf`.
#[test]
fn extracts_publication_properties_and_tags() {
    let xml = r#"<?xml version='1.0' encoding='utf-8'?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Книга</dc:title>
    <dc:language>ru</dc:language>
    <dc:date>2019-05-01T00:00:00+00:00</dc:date>
    <dc:publisher>Издательство</dc:publisher>
    <dc:description>&lt;p&gt;Описание книги&lt;/p&gt;</dc:description>
    <dc:subject>История</dc:subject>
    <dc:subject>Наука</dc:subject>
    <dc:identifier>uuid:1234</dc:identifier>
    <dc:identifier>urn:isbn:978-5-00000-000-0</dc:identifier>
  </metadata>
</package>"#;

    let metadata = extract(xml.as_bytes());

    assert_eq!(metadata.language.as_deref(), Some("ru"));
    assert_eq!(
        metadata.published.as_deref(),
        Some("2019-05-01T00:00:00+00:00")
    );
    assert_eq!(metadata.publisher.as_deref(), Some("Издательство"));
    assert_eq!(metadata.description.as_deref(), Some("Описание книги"));
    assert_eq!(
        metadata.tags,
        vec!["История".to_string(), "Наука".to_string()]
    );
    assert_eq!(
        metadata.identifier.as_deref(),
        Some("urn:isbn:978-5-00000-000-0")
    );
}
