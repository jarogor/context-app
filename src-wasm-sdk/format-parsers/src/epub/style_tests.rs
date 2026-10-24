use super::{book_style, inline_styles, sanitize_css};

#[test]
fn keeps_typographic_rules() {
    let css = "p { margin: 0; text-indent: 1.5em; } h1 { font-size: 2em; text-align: center; }";

    let result = sanitize_css(css);

    assert!(result.contains("text-indent:1.5em"), "{result}");
    assert!(result.contains("font-size:2em"), "{result}");
    assert!(result.contains("text-align:center"), "{result}");
}

#[test]
fn drops_layout_breaking_properties() {
    let css = "div { position: absolute; float: left; width: 100%; height: 500px; display: none; }";

    let result = sanitize_css(css);

    assert_eq!(result, "", "правило без свойств отброшено");
}

#[test]
fn drops_publisher_colors() {
    let css = "p { color: #333; background: white; } em { font-style: italic; }";

    let result = sanitize_css(css);

    assert!(!result.contains("color"), "{result}");
    assert!(!result.contains("background"), "{result}");
    assert!(result.contains("font-style:italic"), "{result}");
}

#[test]
fn drops_publisher_font_family() {
    let css = "p { font-family: 'Times New Roman', serif; font-size: 1.1em; }";

    let result = sanitize_css(css);

    assert!(
        !result.contains("font-family"),
        "шрифт выбирает читалка: {result}"
    );
    assert!(result.contains("font-size:1.1em"), "{result}");
}

#[test]
fn converts_absolute_lengths_to_rem() {
    let css = "p { margin: 16px 0; font-size: 12pt; }";

    let result = sanitize_css(css);

    assert!(result.contains("margin:1.0000rem 0"), "{result}");
    assert!(result.contains("font-size:1.0000rem"), "{result}");
}

#[test]
fn keeps_media_block() {
    let css = "@media (max-width: 600px) { p { text-indent: 0; } }";

    let result = sanitize_css(css);

    assert_eq!(result, "@media (max-width: 600px){p{text-indent:0}}");
}

#[test]
fn drops_import_and_font_face() {
    let css = "@import url('x.css'); @font-face { font-family: X; src: url(x.woff); } p { text-indent: 1em; }";

    let result = sanitize_css(css);

    assert!(!result.contains("@import"), "{result}");
    assert!(!result.contains("@font-face"), "{result}");
    assert!(result.contains("text-indent:1em"), "{result}");
}

#[test]
fn strips_comments() {
    let css = "/* комментарий */ p { /* внутри */ text-indent: 1em; }";

    assert_eq!(sanitize_css(css), "p{text-indent:1em}");
}

#[test]
fn drops_external_resources() {
    let css = "p { background-image: url(a.png); border-image: url(b.png) 30; text-indent: 1em; }";

    let result = sanitize_css(css);

    assert!(!result.contains("url("), "{result}");
    assert!(result.contains("text-indent:1em"), "{result}");
}

#[test]
fn collects_styles_of_all_sources() {
    let style = book_style(&[
        ("style.css".to_string(), "p{text-indent:1em}".to_string()),
        (
            "typography.css".to_string(),
            "h1{text-align:center}".to_string(),
        ),
    ]);

    assert_eq!(style.css, "p{text-indent:1em}\nh1{text-align:center}");
}

#[test]
fn skips_empty_sources() {
    let style = book_style(&[
        ("a.css".to_string(), "   ".to_string()),
        ("b.css".to_string(), "p{text-indent:1em}".to_string()),
    ]);

    assert_eq!(style.css, "p{text-indent:1em}");
}

#[test]
fn extracts_inline_styles() {
    let html = "<style type=\"text/css\">p{text-indent:1em}</style><p>текст</p><style>em{font-style:italic}</style>";

    let styles = inline_styles(html);

    assert_eq!(styles.len(), 2);
    assert_eq!(styles[0], "p{text-indent:1em}");
    assert_eq!(styles[1], "em{font-style:italic}");
}

#[test]
fn drops_book_margins_of_document_frame() {
    // Издательский CSS часто снимает поля `body`: тогда текст прижимался к
    // левому краю области чтения. Поля документа принадлежат читалке.
    let css = "body{margin-left:0;margin-right:0;padding-left:0;padding-right:0;text-indent:1em}";

    let result = sanitize_css(css);

    assert_eq!(result, "body{text-indent:1em}", "{result}");
}

#[test]
fn keeps_margins_of_content_elements() {
    // У элементов содержимого поля и отступы — это типографика книги.
    let css = "p{margin:0;text-indent:1.5em} blockquote{margin-left:1em;padding-left:1em}";

    let result = sanitize_css(css);

    assert!(result.contains("p{margin:0;text-indent:1.5em}"), "{result}");
    assert!(
        result.contains("blockquote{margin-left:1em;padding-left:1em}"),
        "{result}"
    );
}

#[test]
fn splits_selector_list_to_protect_frame_only() {
    // Одно правило на список селекторов: поля отбрасываются только у `body`,
    // а у элемента главы остаются.
    let css = "body, .calibre1 { margin-left: 0; text-indent: 1em; }";

    let result = sanitize_css(css);

    assert_eq!(
        result,
        "body{text-indent:1em}\n.calibre1{margin-left:0;text-indent:1em}"
    );
}

#[test]
fn drops_root_frame_properties() {
    let css = "html{overflow:hidden;margin:0} :root{margin:0;padding:0;font-size:1em}";

    let result = sanitize_css(css);

    assert!(!result.contains("html{"), "{result}");
    assert_eq!(result, ":root{font-size:1em}");
}
