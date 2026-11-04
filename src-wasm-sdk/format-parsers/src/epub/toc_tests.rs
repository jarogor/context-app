//! Тесты оглавления EPUB.

use super::*;

/// Разбор навигационного документа EPUB 3.
#[test]
fn reads_nav_titles() {
    let nav = r#"<html xmlns="http://www.w3.org/1999/xhtml"><body>
      <nav epub:type="toc"><ol>
        <li><a href="text/ch01.xhtml">Часть первая</a></li>
        <li><a href="text/ch02.xhtml#part">Часть вторая</a></li>
      </ol></nav>
    </body></html>"#;
    let toc = parse_nav(nav, "OEBPS/content.opf");
    assert_eq!(toc.title_for("OEBPS/text/ch01.xhtml"), Some("Часть первая"));
    assert_eq!(
        toc.title_for("OEBPS/text/ch02.xhtml"),
        Some("Часть вторая"),
        "якорь отбрасывается: подпись принадлежит файлу"
    );
}

/// Оглавление EPUB 2 из `toc.ncx`.
#[test]
fn reads_ncx_titles() {
    let ncx = r#"<ncx><navMap>
      <navPoint id="p1">
        <navLabel><text>Первая глава</text></navLabel>
        <content src="text/ch01.xhtml"/>
      </navPoint>
      <navPoint id="p2">
        <navLabel><text>Вторая глава</text></navLabel>
        <content src="text/ch02.xhtml"/>
      </navPoint>
    </navMap></ncx>"#;
    let toc = parse_ncx(ncx, "OEBPS/content.opf");
    assert_eq!(toc.title_for("OEBPS/text/ch01.xhtml"), Some("Первая глава"));
    assert_eq!(toc.title_for("OEBPS/text/ch02.xhtml"), Some("Вторая глава"));
}

/// Первая подпись файла побеждает: путь адресует файл, а не пункт.
#[test]
fn first_title_wins_for_file() {
    let nav = r#"<nav epub:type="toc"><ol>
      <li><a href="a.xhtml">Целиком</a></li>
      <li><a href="a.xhtml#part">Часть файла</a></li>
    </ol></nav>"#;
    let toc = parse_nav(nav, "content.opf");
    assert_eq!(toc.title_for("a.xhtml"), Some("Целиком"));
}

/// Подпись нормализуется: переводы строк и лишние пробелы схлопываются.
#[test]
fn normalizes_title_whitespace() {
    let nav = "<nav epub:type=\"toc\"><ol><li><a href=\"a.xhtml\">  Длинное\n   название  </a></li></ol></nav>";
    let toc = parse_nav(nav, "content.opf");
    assert_eq!(toc.title_for("a.xhtml"), Some("Длинное название"));
}

/// Внешние ссылки в оглавление не попадают.
#[test]
fn ignores_external_links() {
    let nav = r#"<nav epub:type="toc"><ol>
      <li><a href="https://example.org/">Сайт</a></li>
      <li><a href="a.xhtml">Глава</a></li>
    </ol></nav>"#;
    let toc = parse_nav(nav, "content.opf");
    assert_eq!(toc.title_for("a.xhtml"), Some("Глава"));
    assert_eq!(toc.entries.len(), 1, "внешняя ссылка пропущена");
}

/// Пустой или битый навигационный документ не ломает разбор.
#[test]
fn broken_nav_is_ignored() {
    assert!(parse_nav("", "content.opf").is_empty());
    assert!(parse_nav("<nav><ol><li>", "content.opf").is_empty());
    assert!(parse_ncx("<ncx><navMap>", "content.opf").is_empty());
}

/// Ссылка только с якорем не адресует файл: подписи не будет.
#[test]
fn anchor_only_link_is_ignored() {
    let nav = "<nav epub:type=\"toc\"><ol><li><a href=\"#top\">В начало</a></li></ol></nav>";
    assert!(parse_nav(nav, "content.opf").is_empty());
}
