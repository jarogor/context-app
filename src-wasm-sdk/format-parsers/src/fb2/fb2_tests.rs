use super::*;

/// Минимальная книга FB2 с переданным содержимым тела.
fn book(body: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="utf-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0" xmlns:l="http://www.w3.org/1999/xlink">
<description><title-info><book-title>Книга</book-title></title-info></description>
{body}
</FictionBook>"#
    )
}

#[test]
fn делит_тело_на_главы_по_секциям() {
    let source = book(
        r#"<body>
<section><title><p>Первая</p></title><p>Текст один.</p></section>
<section><title><p>Вторая</p></title><p>Текст два.</p></section>
</body>"#,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert_eq!(chapters.len(), 2);
    assert_eq!(chapters[0].title.as_deref(), Some("Первая"));
    assert!(chapters[0].html.contains("Текст один."));
    assert_eq!(chapters[1].title.as_deref(), Some("Вторая"));
}

#[test]
fn книга_без_секций_становится_одной_главой() {
    let source = book(r#"<body><title><p>Название</p></title><p>Единственный текст.</p></body>"#);
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert_eq!(chapters.len(), 1);
    assert_eq!(chapters[0].title.as_deref(), Some("Название"));
    assert!(chapters[0].html.contains("Единственный текст."));
}

#[test]
fn вложенные_секции_остаются_в_главе() {
    let source = book(
        r#"<body><section><title><p>Глава</p></title>
<section><title><p>Часть</p></title><p>Внутри.</p></section>
</section></body>"#,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert_eq!(chapters.len(), 1);
    assert!(chapters[0].html.contains("Глава"));
    assert!(chapters[0].html.contains("Внутри."));
}

#[test]
fn стихи_эпиграф_и_цитата_сохраняются() {
    let source = book(
        r#"<body><section><title><p>Глава</p></title>
<epigraph><p>Эпиграф.</p><text-author>Автор</text-author></epigraph>
<poem><stanza><v>Строка первая</v><v>Строка вторая</v></stanza></poem>
<cite><p>Цитата.</p></cite>
</section></body>"#,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    let html = &chapters[0].html;
    assert!(html.contains("fb2-epigraph"));
    assert!(html.contains("fb2-poem"));
    assert!(html.contains("fb2-verse"));
    assert!(html.contains("fb2-cite"));
}

#[test]
fn изображение_встраивается_из_binary() {
    let source = book(
        r##"<body><section><title><p>Глава</p></title>
<image l:href="#img1"/>
</section></body>
<binary id="img1" content-type="image/png">iVBORw0KGgo=</binary>"##,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert!(chapters[0]
        .html
        .contains(r#"src="data:image/png;base64,iVBORw0KGgo=""#));
}

#[test]
fn сноски_добавляются_отдельной_главой_и_ссылка_сохраняется() {
    let source = book(
        r##"<body><section><title><p>Глава</p></title>
<p>Текст<a l:href="#note1" type="note">1</a>.</p>
</section></body>
<body name="notes"><section id="note1"><title><p>1</p></title><p>Сноска.</p></section></body>"##,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert_eq!(chapters.len(), 2);
    assert!(chapters[0].html.contains(r##"href="#note1""##));
    assert!(chapters[0].html.contains("fb2-note"));
    assert_eq!(chapters[1].title.as_deref(), Some("Сноски"));
    assert!(chapters[1].html.contains("Сноска."));
    assert!(chapters[1].html.contains(r#"id="note1""#));
}

#[test]
fn текст_экранируется() {
    let source = book(
        r#"<body><section><title><p>Глава</p></title><p>a &lt; b &amp; c</p></section></body>"#,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert!(chapters[0].html.contains("a &lt; b &amp; c"));
}

#[test]
fn внешние_ссылки_безопасных_схем_сохраняются() {
    let source = book(
        r#"<body><section><title><p>Глава</p></title>
<p><a l:href="https://example.org">Сайт</a><a l:href="javascript:alert(1)">Плохо</a></p>
</section></body>"#,
    );
    let chapters = read_fb2_chapters(source.as_bytes()).expect("главы");
    assert!(chapters[0].html.contains(r#"href="https://example.org""#));
    assert!(!chapters[0].html.contains("javascript:"));
}

#[test]
fn windows_1251_декодируется() {
    let source =
        book(r#"<body><section><title><p>Глава</p></title><p>Привет</p></section></body>"#);
    let encoded = source.replace("encoding=\"utf-8\"", "encoding=\"windows-1251\"");
    let mut windows = Vec::new();
    for character in encoded.chars() {
        let mut buffer = [0u8; 4];
        let text = character.encode_utf8(&mut buffer);
        if character.is_ascii() {
            windows.extend_from_slice(text.as_bytes());
        } else {
            let (bytes, _, _) = encoding_rs::WINDOWS_1251.encode(text);
            windows.extend_from_slice(&bytes);
        }
    }
    let chapters = read_fb2_chapters(&windows).expect("главы");
    assert!(chapters[0].html.contains("Привет"));
}

#[test]
fn повреждённый_файл_даёт_ошибку() {
    assert!(read_fb2_chapters(b"not xml").is_err());
}

#[test]
fn чужой_корень_даёт_ошибку() {
    assert!(read_fb2_chapters(b"<root><body/></root>").is_err());
}

#[test]
fn пустая_книга_даёт_ошибку() {
    let source = book("<body/>");
    assert!(read_fb2_chapters(source.as_bytes()).is_err());
}
