use super::extract;

/// DjVu с секцией метаданных.
#[test]
fn extracts_metadata_fields() {
    let bytes = b"....metadata\ntitle=\"DjVu Book\"\nauthor=\"A; B\"\n";

    let metadata = extract(bytes);

    assert_eq!(metadata.title.as_deref(), Some("DjVu Book"));
    assert_eq!(
        metadata.authors,
        vec!["A".to_string(), "B".to_string()]
    );
}

/// DjVu без метаданных даёт пустые поля.
#[test]
fn falls_back_without_metadata() {
    let metadata = extract(b"\x00\x01no data here");

    assert!(metadata.title.is_none());
    assert!(metadata.authors.is_empty());
    assert!(metadata.cover.is_none());
}
