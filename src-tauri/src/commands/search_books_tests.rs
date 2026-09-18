use serde_json::Value;

#[test]
fn extracts_books_from_source_search() {
    let value: Value = serde_json::from_str(r#"{"books":[{"id":"book"}]}"#).expect("ответ поиска");
    let books = value.get("books").expect("список книг");

    assert_eq!(books[0]["id"], "book");
}
