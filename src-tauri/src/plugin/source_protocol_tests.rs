use super::*;

#[test]
fn serializes_complete_catalog() {
    let catalog = SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: 7,
        books: vec![SourceBook {
            id: "author/book".to_string(),
            title: "Книга".to_string(),
            authors: vec!["Автор".to_string()],
            tags: Vec::new(),
            series: Vec::new(),
            files: vec![SourceFile {
                kind: SourceFileKind::Book,
                path: "author/book/book.epub".to_string(),
                format: "epub".to_string(),
            }],
        }],
    };

    let payload = serde_json::to_string(&catalog).expect("сериализация каталога");
    let restored: SourceCatalog = serde_json::from_str(&payload).expect("десериализация каталога");

    assert_eq!(restored, catalog);
    assert!(restored.validate().is_ok());
}

#[test]
fn rejects_incompatible_catalog_version() {
    let catalog = SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION + 1,
        revision: 1,
        books: Vec::new(),
    };

    assert!(catalog.validate().is_err());
}

#[test]
fn supports_empty_collections() {
    let payload = r#"{
        "protocol_version": 1,
        "revision": 1,
        "books": []
    }"#;

    let catalog: SourceCatalog = serde_json::from_str(payload).expect("пустой каталог");

    assert!(catalog.books.is_empty());
}
