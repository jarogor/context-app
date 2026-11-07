use super::extract;

/// PDF со словарём `/Info`.
#[test]
fn extracts_info_metadata() {
    let pdf =
        b"%PDF-1.4\n1 0 obj\n<< /Title (My Book) /Author (Ivan Petrov; Anna Sidorova) >>\nendobj\n";

    let metadata = extract(pdf);

    assert_eq!(metadata.title.as_deref(), Some("My Book"));
    assert_eq!(
        metadata.authors,
        vec!["Ivan Petrov".to_string(), "Anna Sidorova".to_string()]
    );
    assert!(metadata.cover.is_none());
}

/// Hex-строка UTF-16BE декодируется.
#[test]
fn extracts_utf16_hex_title() {
    let pdf = b"<< /Title <FEFF0422043504410442> >>";

    let metadata = extract(pdf);

    assert_eq!(metadata.title.as_deref(), Some("Тест"));
}

/// PDF без метаданных даёт пустые поля.
#[test]
fn falls_back_without_metadata() {
    let metadata = extract(b"%PDF-1.4\nno info here");

    assert!(metadata.title.is_none());
    assert!(metadata.authors.is_empty());
    assert!(metadata.cover.is_none());
}

/// Язык берётся из `/Lang`; дата файла не выдаётся за дату издания.
#[test]
fn extracts_language_without_publication_date() {
    let pdf = b"<< /Lang (ru-RU) /CreationDate (D:20190101000000) /Title (T) >>";

    let metadata = extract(pdf);

    assert_eq!(metadata.language.as_deref(), Some("ru-RU"));
    assert!(
        metadata.published.is_none(),
        "CreationDate — не дата издания"
    );
}
