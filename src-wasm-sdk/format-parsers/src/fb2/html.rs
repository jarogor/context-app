//! Преобразование разметки FB2 в безопасный HTML глав.
//!
//! Теги строит сам преобразователь, а текст книги экранируется, поэтому
//! исполняемая разметка из файла в документ чтения не попадает. Изображения
//! из `<binary>` встраиваются как `data:`-URI, а внутренние ссылки сохраняются
//! для переходов к сноскам.

use std::collections::HashMap;

use base64::Engine;
use roxmltree::Node;

use super::attribute;

/// Изображения книги: идентификатор `<binary>` → `data:`-URI.
pub(crate) type Binaries = HashMap<String, String>;

/// Сбор изображений из всех `<binary>` документа.
pub(crate) fn binaries(root: Node<'_, '_>) -> Binaries {
    let mut result = Binaries::new();
    for node in root.descendants() {
        if !node.is_element() || node.tag_name().name() != "binary" {
            continue;
        }
        let Some(id) = attribute(node, "id") else {
            continue;
        };
        let content_type = attribute(node, "content-type").unwrap_or("image/jpeg");
        let encoded = node
            .text()
            .unwrap_or_default()
            .chars()
            .filter(|character| !character.is_whitespace())
            .collect::<String>();
        if encoded.is_empty() {
            continue;
        }
        let mime = if content_type.contains('/') {
            content_type.to_ascii_lowercase()
        } else {
            "image/jpeg".to_string()
        };
        let bytes = base64::engine::general_purpose::STANDARD.decode(encoded.as_bytes());
        let Ok(bytes) = bytes else {
            continue;
        };
        let payload = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        result.insert(id.to_string(), format!("data:{mime};base64,{payload}"));
    }
    result
}

/// Заголовок раздела или тела книги без разметки.
pub(crate) fn title_of(node: Node<'_, '_>) -> Option<String> {
    let title = node
        .children()
        .find(|child| child.is_element() && child.tag_name().name() == "title")?;
    let text = title
        .descendants()
        .filter(|child| child.is_text())
        .filter_map(|child| child.text())
        .collect::<Vec<_>>()
        .join(" ");
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        None
    } else {
        Some(normalized)
    }
}

/// HTML секции вместе с обёрткой.
pub(crate) fn render_section(section: Node<'_, '_>, binaries: &Binaries) -> String {
    let id = attribute(section, "id")
        .map(|id| format!(r#" id="{}""#, escape(id)))
        .unwrap_or_default();
    format!(
        r#"<section class="fb2-section"{id}>{}</section>"#,
        render_children(section, binaries)
    )
}

/// HTML дочерних узлов (текст и элементы).
pub(crate) fn render_children(node: Node<'_, '_>, binaries: &Binaries) -> String {
    let mut result = String::new();
    for child in node.children() {
        if child.is_text() {
            result.push_str(&escape(child.text().unwrap_or_default()));
        } else if child.is_element() {
            result.push_str(&render_element(child, binaries));
        }
    }
    result
}

/// HTML одного элемента FB2.
fn render_element(node: Node<'_, '_>, binaries: &Binaries) -> String {
    let tag = node.tag_name().name();
    match tag {
        "section" => render_section(node, binaries),
        "title" => wrap("h2", "fb2-title", node, binaries),
        "subtitle" => wrap("h3", "fb2-subtitle", node, binaries),
        "p" => wrap("p", "", node, binaries),
        "emphasis" => wrap("em", "", node, binaries),
        "strong" => wrap("strong", "", node, binaries),
        "strikethrough" => wrap("s", "", node, binaries),
        "sub" => wrap("sub", "", node, binaries),
        "sup" => wrap("sup", "", node, binaries),
        "code" => wrap("code", "", node, binaries),
        "style" => wrap("span", "fb2-style", node, binaries),
        "epigraph" => wrap("blockquote", "fb2-epigraph", node, binaries),
        "cite" => wrap("blockquote", "fb2-cite", node, binaries),
        "annotation" => wrap("div", "fb2-annotation", node, binaries),
        "poem" => wrap("div", "fb2-poem", node, binaries),
        "stanza" => wrap("div", "fb2-stanza", node, binaries),
        "v" => wrap("p", "fb2-verse", node, binaries),
        "text-author" => wrap("p", "fb2-text-author", node, binaries),
        "date" => wrap("p", "fb2-date", node, binaries),
        "table" => wrap("table", "fb2-table", node, binaries),
        "tr" => wrap("tr", "", node, binaries),
        "td" => wrap("td", "", node, binaries),
        "th" => wrap("th", "", node, binaries),
        "empty-line" => "<br />".to_string(),
        "a" => render_link(node, binaries),
        "image" => render_image(node, binaries),
        // Служебные элементы описания и кодирования не попадают в текст.
        "binary" | "description" | "stylesheet" => String::new(),
        _ => render_children(node, binaries),
    }
}

/// Обёртка элемента с необязательным классом.
fn wrap(tag: &str, class: &str, node: Node<'_, '_>, binaries: &Binaries) -> String {
    let class = if class.is_empty() {
        String::new()
    } else {
        format!(r#" class="{class}""#)
    };
    format!("<{tag}{class}>{}</{tag}>", render_children(node, binaries))
}

/// Ссылка: внутренняя — с сохранением якоря, внешняя — только безопасных схем.
fn render_link(node: Node<'_, '_>, binaries: &Binaries) -> String {
    let href = attribute(node, "href").unwrap_or_default();
    if let Some(anchor) = href.strip_prefix('#') {
        let class = if attribute(node, "type") == Some("note") {
            r#" class="fb2-note""#
        } else {
            ""
        };
        return format!(
            r##"<a{class} href="#{}">{}</a>"##,
            escape(anchor),
            render_children(node, binaries)
        );
    }
    let lower = href.to_ascii_lowercase();
    let safe = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:");
    if safe {
        return format!(
            r#"<a href="{}" rel="noreferrer noopener">{}</a>"#,
            escape(href),
            render_children(node, binaries)
        );
    }
    render_children(node, binaries)
}

/// Изображение из `<binary>`.
fn render_image(node: Node<'_, '_>, binaries: &Binaries) -> String {
    let Some(href) = attribute(node, "href") else {
        return String::new();
    };
    let id = href.trim_start_matches('#');
    let Some(uri) = binaries.get(id) else {
        return String::new();
    };
    format!(r#"<img class="fb2-image" src="{}" alt="" />"#, escape(uri))
}

/// Экранирование текста и значений атрибутов HTML.
fn escape(value: &str) -> String {
    let mut result = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => result.push_str("&amp;"),
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '"' => result.push_str("&quot;"),
            '\'' => result.push_str("&#39;"),
            character => result.push(character),
        }
    }
    result
}
