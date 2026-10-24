//! Оформление главы EPUB: стили книги и их безопасная очистка.
//!
//! Издательский CSS — часть оформления книги: в нём живут размеры заголовков,
//! отступы абзацев, курсив, сноски и таблицы. Без него конвертированные книги
//! (у которых вся вёрстка в классах и отдельном `style.css`) выглядят ровным
//! текстом. Здесь собраны все стили, на которые ссылаются главы, и отброшено
//! то, что ломает чтение: позиционирование, фиксированные размеры страницы,
//! внешние ресурсы и правила, задающие цвет текста и фона (их владелец — тема
//! области чтения).
//!
//! Очистка идёт по правилам, а не регуляркой по всему файлу: комментарии,
//! вложенные блоки `@media`, `@font-face` и неизвестные `@`-правила
//! разбираются отдельно, поэтому правило не «съедает» соседнее.

/// Оформление книги, собранное из всех её CSS-источников.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct BookStyle {
    /// Правила CSS, уже очищенные от опасных свойств.
    pub css: String,
}

/// Свойства, которые отбрасываются: они ломают раскладку читалки.
///
/// Позиционирование и плавающие блоки вырывают текст из потока прокрутки,
/// фиксированные размеры страницы не дают документу подстраиваться под ширину
/// области, а транзишены и анимации мешают выделению и заметкам. Цвет текста и
/// фона отбрасывается: его задаёт тема области чтения, а не издатель.
const BLOCKED_PROPERTIES: &[&str] = &[
    "position",
    "float",
    "clear",
    "visibility",
    "overflow",
    "overflow-x",
    "overflow-y",
    "columns",
    "column-count",
    "column-width",
    "column-gap",
    "column-rule",
    "transform",
    "transition",
    "animation",
    "content",
    "z-index",
    "left",
    "right",
    "top",
    "bottom",
    "background",
    "background-color",
    "background-image",
    "background-position",
    "background-repeat",
    "background-size",
    "background-attachment",
    "background-clip",
    "color",
    "opacity",
    "filter",
    "mix-blend-mode",
    "white-space",
    "word-break",
    "word-wrap",
    "overflow-wrap",
    "writing-mode",
    "direction",
    "cursor",
    "outline",
    "outline-offset",
    "box-shadow",
    "text-shadow",
    "page-break-after",
    "page-break-before",
    "page-break-inside",
    "break-after",
    "break-before",
    "break-inside",
    "orphans",
    "widows",
    // Шрифт выбирает читалка: переключатель «с засечками / без засечек» не
    // должен перебиваться издательским `font-family`.
    "font-family",
    "font",
    // Ширина и высота страницы не подчиняются области чтения, а фиксированные
    // размеры блока обрезают текст и ломают прокрутку.
    "width",
    "min-width",
    "max-width",
    "height",
    "min-height",
    "max-height",
    "display",
    "box-sizing",
    "aspect-ratio",
];

/// Свойства, которые отбрасываются у самого документа книги (`html`, `body`).
///
/// Поля, отступы и ширина документа принадлежат читалке: по ним текст
/// отступает от краёв области и центрируется. Издательский CSS часто снимает их
/// (`body{margin-left:0;margin-right:0}`), и текст прижимался к левому краю.
/// У элементов содержимого те же свойства — типографика, и они сохраняются.
const BLOCKED_FRAME_PROPERTIES: &[&str] = &[
    "margin",
    "margin-left",
    "margin-right",
    "margin-top",
    "margin-bottom",
    "padding",
    "padding-left",
    "padding-right",
    "padding-top",
    "padding-bottom",
];

/// `@`-правила, которые разрешено сохранять.
///
/// Остальные (`@import`, `@font-face`, `@page`, `@supports`, `@namespace`)
/// отбрасываются: первые тянут внешние ресурсы, шрифты не нужны (шрифт
/// выбирает читалка), а постраничные правила относятся к печати, а не к
/// прокрутке.
const KEPT_AT_RULES: &[&str] = &["media"];

/// Извлечение оформления книги из CSS-файлов и встроенных `<style>`.
///
/// `sources` — пары «имя источника, содержимое»; каждое содержимое очищается
/// тем же разбором. Пустые и нечитаемые источники пропускаются: отсутствие
/// оформления не мешает читать книгу.
pub fn book_style(sources: &[(String, String)]) -> BookStyle {
    let mut css = String::new();
    for (_, source) in sources {
        let cleaned = sanitize_css(source);
        if cleaned.is_empty() {
            continue;
        }
        if !css.is_empty() {
            css.push('\n');
        }
        css.push_str(&cleaned);
    }
    BookStyle { css }
}

/// Содержимое всех `<style>` документа книги.
pub fn inline_styles(html: &str) -> Vec<String> {
    let lower = html.to_ascii_lowercase();
    let mut styles = Vec::new();
    let mut cursor = 0;
    while let Some(relative) = lower[cursor..].find("<style") {
        let start = cursor + relative;
        let Some(open_end) = lower[start..].find('>') else {
            break;
        };
        let content_start = start + open_end + 1;
        let Some(close_relative) = lower[content_start..].find("</style>") else {
            break;
        };
        let content_end = content_start + close_relative;
        styles.push(html[content_start..content_end].to_string());
        cursor = content_end + "</style>".len();
    }
    styles
}

/// Очистка CSS: остаются только безвредные правила оформления текста.
///
/// Комментарии удаляются, `@import`, `@font-face` и прочие непечатаемые
/// `@`-правила отбрасываются целиком, у обычных правил вычищаются свойства из
/// [`BLOCKED_PROPERTIES`]. Правило без оставшихся свойств отбрасывается.
/// Абсолютные единицы длины приводятся к `rem`, чтобы оформление следовало за
/// масштабом чтения.
pub fn sanitize_css(css: &str) -> String {
    let without_comments = strip_comments(css);
    let mut result = String::new();
    let mut cursor = 0;
    while cursor < without_comments.len() {
        let rest = &without_comments[cursor..];
        let Some(at) = rest.find('@') else {
            push_part(&mut result, &sanitize_rules(rest));
            break;
        };
        push_part(&mut result, &sanitize_rules(&rest[..at]));
        let rule = &rest[at..];
        let consumed = at_rule_span(rule);
        if is_kept_at_rule(rule) {
            if let Some(body) = block_body(rule) {
                let inner = sanitize_rules(body);
                if !inner.is_empty() {
                    result.push_str(&format!("@media{}{{{inner}}}", media_condition(rule)));
                }
            }
        }
        cursor += at + consumed.max(1);
    }
    result.trim().to_string()
}

/// Добавление части CSS с переводом строки между частями.
fn push_part(result: &mut String, part: &str) {
    let part = part.trim();
    if part.is_empty() {
        return;
    }
    if !result.is_empty() {
        result.push('\n');
    }
    result.push_str(part);
}

/// Начало `@`-правила с разрешённым именем.
fn is_kept_at_rule(rule: &str) -> bool {
    let Some(name_end) = rule
        .find(|character: char| character.is_whitespace() || character == '{' || character == ';')
    else {
        return false;
    };
    let name = rule[1..name_end].to_ascii_lowercase();
    KEPT_AT_RULES.contains(&name.as_str())
}

/// Длина `@`-правила от начала `@` до конца правила.
fn at_rule_span(source: &str) -> usize {
    let Some(block_start) = source.find('{') else {
        return source
            .find(';')
            .map(|index| index + 1)
            .unwrap_or(source.len());
    };
    // `@`-правило без блока (`@import ...;`) заканчивается раньше `{`.
    if let Some(semicolon) = source.find(';') {
        if semicolon < block_start {
            return semicolon + 1;
        }
    }
    let bytes = source.as_bytes();
    let mut depth = 0i32;
    for (index, byte) in bytes.iter().enumerate().skip(block_start) {
        match byte {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return index + 1;
                }
            }
            _ => {}
        }
    }
    source.len()
}

/// Содержимое блока `@`-правила без внешних скобок.
fn block_body(source: &str) -> Option<&str> {
    let start = source.find('{')?;
    let bytes = source.as_bytes();
    let mut depth = 0i32;
    for (index, byte) in bytes.iter().enumerate().skip(start) {
        match byte {
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&source[start + 1..index]);
                }
            }
            _ => {}
        }
    }
    None
}

/// Условие `@media` из заголовка правила (текст между именем и `{`).
fn media_condition(source: &str) -> String {
    let Some(start) = source.find('{') else {
        return String::new();
    };
    let header = &source[1..start];
    let condition = header
        .split_once(char::is_whitespace)
        .map(|(_, rest)| rest.trim())
        .unwrap_or_default();
    if condition.is_empty() {
        String::new()
    } else {
        format!(" {condition}")
    }
}

/// Очистка набора обычных правил (без `@`-правил на верхнем уровне).
fn sanitize_rules(source: &str) -> String {
    let mut result = String::new();
    let mut cursor = 0;
    while cursor < source.len() {
        let Some(open_relative) = source[cursor..].find('{') else {
            break;
        };
        let open = cursor + open_relative;
        let Some(close_relative) = source[open..].find('}') else {
            break;
        };
        let close = open + close_relative;
        let selector = source[cursor..open].trim();
        let declarations = &source[open + 1..close];
        cursor = close + 1;
        if selector.is_empty() || selector.starts_with('@') {
            continue;
        }
        for part in selector.split(',') {
            let part = part.trim();
            if part.is_empty() {
                continue;
            }
            let kept = sanitize_declarations(declarations, is_frame_selector(part));
            if kept.is_empty() {
                continue;
            }
            if !result.is_empty() {
                result.push('\n');
            }
            result.push_str(part);
            result.push('{');
            result.push_str(&kept);
            result.push('}');
        }
    }
    result
}

/// Признак селектора самого документа книги (`html`, `body`, `:root`).
///
/// Такой селектор задаёт каркас страницы чтения, а не оформление текста:
/// его поля и отступы принадлежат читалке.
fn is_frame_selector(selector: &str) -> bool {
    let name = selector
        .split(|character: char| character.is_whitespace() || character == '>' || character == '+')
        .next_back()
        .unwrap_or("")
        .trim()
        .to_ascii_lowercase();
    if name.starts_with(":root") || name == "html" || name == "body" {
        return true;
    }
    let name = name.split(['.', '#', ':', '[']).next().unwrap_or("");
    matches!(name, "html" | "body")
}

/// Очистка списка объявлений: блокированные свойства отбрасываются.
fn sanitize_declarations(source: &str, frame: bool) -> String {
    let mut kept: Vec<String> = Vec::new();
    for raw in source.split(';') {
        let declaration = raw.trim();
        if declaration.is_empty() {
            continue;
        }
        let Some((name, value)) = declaration.split_once(':') else {
            continue;
        };
        let name = name.trim().to_ascii_lowercase();
        let value = value.trim();
        if name.is_empty() || value.is_empty() || BLOCKED_PROPERTIES.contains(&name.as_str()) {
            continue;
        }
        if frame && BLOCKED_FRAME_PROPERTIES.contains(&name.as_str()) {
            continue;
        }
        // Внешние ресурсы и исполняемые выражения не попадают в документ.
        if value.contains("url(") || value.contains("expression") || value.contains('\\') {
            continue;
        }
        kept.push(format!("{name}:{}", scaled_value(&name, value)));
    }
    kept.join(";")
}

/// Приведение абсолютных единиц длины к `rem`.
///
/// Кегль читалки задаётся на корне документа, поэтому `rem` следует за
/// масштабом чтения, а `px`, `pt` и прочие абсолютные единицы — нет: заголовок
/// в `24px` остался бы прежним при любом кегле. Переводятся только размерные
/// свойства; для прочих значений строка остаётся как есть.
fn scaled_value(property: &str, value: &str) -> String {
    if !is_length_property(property) {
        return value.to_string();
    }
    let mut result = String::with_capacity(value.len());
    let bytes = value.as_bytes();
    let mut index = 0;
    while index < bytes.len() {
        if !bytes[index].is_ascii_digit() && bytes[index] != b'.' {
            result.push(bytes[index] as char);
            index += 1;
            continue;
        }
        let number_start = index;
        while index < bytes.len() && (bytes[index].is_ascii_digit() || bytes[index] == b'.') {
            index += 1;
        }
        let number = &value[number_start..index];
        let unit_start = index;
        while index < bytes.len() && bytes[index].is_ascii_alphabetic() {
            index += 1;
        }
        let unit = &value[unit_start..index].to_ascii_lowercase();
        let factor = match unit.as_str() {
            "px" => Some(1.0 / 16.0),
            "pt" => Some(4.0 / 3.0 / 16.0),
            // 1 пика = 1/6 дюйма = 16 CSS-пикселей, то есть ровно 1rem.
            "pc" => Some(1.0),
            "in" => Some(96.0 / 16.0),
            "cm" => Some(96.0 / 2.54 / 16.0),
            "mm" => Some(96.0 / 25.4 / 16.0),
            "q" => Some(96.0 / 25.4 / 4.0 / 16.0),
            _ => None,
        };
        match factor {
            Some(factor) => {
                let parsed = number.parse::<f64>().unwrap_or(0.0);
                let converted = parsed * factor;
                result.push_str(&format!("{converted:.4}"));
                result.push_str("rem");
            }
            None => {
                result.push_str(number);
                result.push_str(&value[unit_start..index]);
            }
        }
    }
    result
}

/// Свойство, значение которого — длина: его единицы приводятся к `rem`.
fn is_length_property(property: &str) -> bool {
    property.starts_with("margin")
        || property.starts_with("padding")
        || property.starts_with("font-size")
        || property.starts_with("text-indent")
        || property.starts_with("border")
        || property.starts_with("gap")
        || property.starts_with("row-gap")
        || property.starts_with("column-gap")
}

/// Удаление комментариев CSS.
fn strip_comments(css: &str) -> String {
    let mut result = String::with_capacity(css.len());
    let mut cursor = 0;
    while let Some(relative) = css[cursor..].find("/*") {
        let start = cursor + relative;
        result.push_str(&css[cursor..start]);
        let Some(end_relative) = css[start..].find("*/") else {
            return result;
        };
        cursor = start + end_relative + 2;
    }
    result.push_str(&css[cursor..]);
    result
}

#[cfg(test)]
#[path = "style_tests.rs"]
mod tests;
