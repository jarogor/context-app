//! Разбор метаданных `metadata.opf` из папки книги Calibre.

use std::path::Path;

use quick_xml::events::Event;
use quick_xml::Reader;

#[derive(Debug, Default)]
pub(crate) struct Metadata {
    pub title: Option<String>,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub language: Option<String>,
    pub cover: Option<String>,
    pub series: Option<(String, i64)>,
}

/// Чтение поддерживаемых полей OPF. Ошибка разбора оставляется вызывающему,
/// чтобы сканер мог перейти к значениям из структуры каталогов.
pub(crate) fn parse(path: &Path) -> Result<Metadata, String> {
    let data = std::fs::read(path).map_err(|err| err.to_string())?;
    let mut reader = Reader::from_reader(data.as_slice());
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut metadata = Metadata::default();
    let mut current = None::<String>;
    let mut series_name = None::<String>;
    let mut series_index = 0.0_f64;

    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(element)) | Ok(Event::Empty(element)) => {
                let name = String::from_utf8_lossy(element.local_name().as_ref()).to_string();
                current = matches!(name.as_str(), "title" | "creator" | "subject" | "language")
                    .then_some(name.clone());
                if name == "meta" {
                    let mut name_attr = None;
                    let mut content = None;
                    for attribute in element.attributes().flatten() {
                        match attribute.key.local_name().as_ref() {
                            b"name" => {
                                name_attr = Some(
                                    attribute
                                        .unescape_value()
                                        .map_err(|e| e.to_string())?
                                        .into_owned(),
                                )
                            }
                            b"content" => {
                                content = Some(
                                    attribute
                                        .unescape_value()
                                        .map_err(|e| e.to_string())?
                                        .into_owned(),
                                )
                            }
                            _ => {}
                        }
                    }
                    match (name_attr.as_deref(), content) {
                        (Some("calibre:series"), Some(value)) => series_name = Some(value),
                        (Some("calibre:series_index"), Some(value)) => {
                            series_index = value.parse().unwrap_or(0.0);
                        }
                        (Some("cover"), Some(value)) => metadata.cover = Some(value),
                        _ => {}
                    }
                }
            }
            Ok(Event::Text(text)) => {
                if let Some(element) = current.as_deref() {
                    let value = text
                        .unescape()
                        .map_err(|e| e.to_string())?
                        .trim()
                        .to_string();
                    if !value.is_empty() {
                        match element {
                            "title" if metadata.title.is_none() => metadata.title = Some(value),
                            "creator" => metadata.authors.push(value),
                            "subject" => metadata.tags.push(value),
                            "language" if metadata.language.is_none() => {
                                metadata.language = Some(value)
                            }
                            _ => {}
                        }
                    }
                }
            }
            Ok(Event::End(_)) => current = None,
            Ok(Event::Eof) => break,
            Err(error) => return Err(error.to_string()),
            _ => {}
        }
        buffer.clear();
    }

    if let Some(name) = series_name {
        metadata.series = Some((name, series_index.round() as i64));
    }
    Ok(metadata)
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::parse;
    use crate::test_util;

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
}
