use super::source_books;

#[test]
fn extracts_books_from_source_catalog() {
    let value = source_books(
        r#"{"catalog":{"books":[{"id":"book","title":"Book","authors":["Author"],"files":[{"kind":"book","path":"book.epub","format":"epub"}]}]}}"#,
    )
    .expect("список книг");

    assert_eq!(value[0]["id"], "book");
}
