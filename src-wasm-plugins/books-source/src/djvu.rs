//! Анализатор метаданных DjVu (best-effort).
//!
//! DjVu не даёт стабильного места для метаданных; выполняется попытка найти
//! текстовую секцию `metadata` и поля `title`/`author`. При неудаче —
//! пустые метаданные (вызывающий применяет фолбэки).

use crate::models::BookMetadata;

/// Окно байтов вокруг метки метаданных.
const WINDOW: usize = 4096;

/// Извлечение метаданных из содержимого DjVu.
pub(crate) fn extract(bytes: &[u8]) -> BookMetadata {
    let mut title = None;
    let mut authors = Vec::new();
    if let Some(window) = metadata_window(bytes) {
        let text = String::from_utf8_lossy(window);
        title = find_field(&text, "title");
        if let Some(value) = find_field(&text, "author") {
            authors = value
                .split([';', '&'])
                .map(str::trim)
                .filter(|part| !part.is_empty())
                .map(str::to_string)
                .collect();
        }
    }
    BookMetadata {
        title,
        authors,
        cover: None,
    }
}

/// Поиск окна вокруг метки `metadata`.
fn metadata_window(bytes: &[u8]) -> Option<&[u8]> {
    let position = find(bytes, b"metadata")?;
    let start = position.saturating_sub(16);
    let end = (position + WINDOW).min(bytes.len());
    Some(&bytes[start..end])
}

/// Поиск поля вида `key=value` или `key: value` без учёта регистра.
fn find_field(text: &str, key: &str) -> Option<String> {
    let lower = text.to_ascii_lowercase();
    let mut from = 0;
    while let Some(relative) = lower[from..].find(key) {
        let absolute = from + relative;
        let after = &text[absolute + key.len()..];
        let mut chars = after.char_indices();
        let mut value_start = None;
        for (index, character) in chars.by_ref() {
            if character == ' ' || character == '\t' {
                continue;
            }
            if character == '=' || character == ':' {
                value_start = Some(index + character.len_utf8());
            }
            break;
        }
        if let Some(start) = value_start {
            let rest = after[start..].trim_start_matches([' ', '\t', '"', '\'']);
            let end = rest
                .find(['"', '\'', '\n', '\r', '\0'])
                .unwrap_or(rest.len());
            let value = rest[..end].trim();
            if !value.is_empty() {
                return Some(value.to_string());
            }
        }
        from = absolute + key.len();
        if from >= text.len() {
            break;
        }
    }
    None
}

/// Поиск подстроки в байтах.
fn find(haystack: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || haystack.len() < needle.len() {
        return None;
    }
    haystack
        .windows(needle.len())
        .position(|window| window == needle)
}

#[cfg(test)]
#[path = "djvu_tests.rs"]
mod tests;
