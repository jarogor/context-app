//! Определение кодировки и декодирование FB2.
//!
//! FB2 — XML-документ, но распространены книги в `windows-1251`. Кодировка
//! определяется по BOM и XML-декларации; при отсутствии декларации сначала
//! проверяется UTF-8, затем используется `windows-1251`.

use encoding_rs::Encoding;

/// Декодирование байтов FB2 в строку.
pub(crate) fn decode(bytes: &[u8]) -> String {
    if let Some(rest) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8_lossy(rest).into_owned();
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        return decode_utf16(rest, true);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xFE, 0xFF]) {
        return decode_utf16(rest, false);
    }
    match declared_encoding(bytes) {
        Some(label) => decode_with_label(bytes, &label),
        None => decode_without_declaration(bytes),
    }
}

/// Декодирование UTF-16 с указанным порядком байтов.
///
/// Нечётный хвост отбрасывается: он не образует полной единицы.
fn decode_utf16(bytes: &[u8], little_endian: bool) -> String {
    let mut units = Vec::with_capacity(bytes.len() / 2);
    let mut index = 0;
    while index + 1 < bytes.len() {
        let pair = [bytes[index], bytes[index + 1]];
        units.push(if little_endian {
            u16::from_le_bytes(pair)
        } else {
            u16::from_be_bytes(pair)
        });
        index += 2;
    }
    String::from_utf16_lossy(&units)
}

/// Кодировка из XML-декларации в начале документа.
fn declared_encoding(bytes: &[u8]) -> Option<String> {
    let head = &bytes[..bytes.len().min(256)];
    let text = String::from_utf8_lossy(head);
    let start = text.find("encoding")?;
    let after = &text[start + "encoding".len()..];
    let after = after.trim_start();
    let after = after.strip_prefix('=')?.trim_start();
    let quote = after.chars().next()?;
    if quote != '"' && quote != '\'' {
        return None;
    }
    let value = &after[1..];
    let end = value.find(quote)?;
    let encoding = value[..end].trim();
    if encoding.is_empty() {
        None
    } else {
        Some(encoding.to_string())
    }
}

/// Декодирование по имени кодировки; неизвестное имя — UTF-8.
fn decode_with_label(bytes: &[u8], label: &str) -> String {
    match Encoding::for_label(label.as_bytes()) {
        Some(encoding) => {
            let (text, _, _) = encoding.decode(bytes);
            text.into_owned()
        }
        None => String::from_utf8_lossy(bytes).into_owned(),
    }
}

/// Декодирование без декларации: UTF-8, иначе windows-1251.
fn decode_without_declaration(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(text) => text.to_string(),
        Err(_) => {
            let (text, _, _) = encoding_rs::WINDOWS_1251.decode(bytes);
            text.into_owned()
        }
    }
}
