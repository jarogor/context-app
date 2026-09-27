//! Анализатор метаданных PDF.
//!
//! Минимальный разбор словаря `/Info` (`/Title`, `/Author`) без полного
//! парсера PDF: обложка не извлекается.

use crate::models::BookMetadata;

/// Извлечение метаданных из содержимого PDF.
pub(crate) fn extract(bytes: &[u8]) -> BookMetadata {
    BookMetadata {
        title: find_text(bytes, b"/Title").filter(|value| !value.trim().is_empty()),
        authors: find_text(bytes, b"/Author")
            .map(|value| split_authors(&value))
            .unwrap_or_default(),
        cover: None,
    }
}

/// Поиск строкового значения ключа в байтах.
fn find_text(bytes: &[u8], key: &[u8]) -> Option<String> {
    let position = find(bytes, key)?;
    parse_pdf_string(&bytes[position + key.len()..])
}

/// Разбор PDF-строки: литерал `(...)` или hex `<...>`.
fn parse_pdf_string(bytes: &[u8]) -> Option<String> {
    let start = bytes.iter().position(|byte| !byte.is_ascii_whitespace())?;
    match bytes[start] {
        b'(' => parse_literal(&bytes[start + 1..]),
        b'<' => parse_hex(&bytes[start..]),
        _ => None,
    }
}

/// Разбор строкового литерала `(...)` с учётом вложенности и escape-последовательностей.
fn parse_literal(bytes: &[u8]) -> Option<String> {
    let mut depth = 1usize;
    let mut index = 0;
    let mut result: Vec<u8> = Vec::new();
    while index < bytes.len() {
        let byte = bytes[index];
        match byte {
            b'\\' => {
                index += 1;
                let escaped = *bytes.get(index)?;
                match escaped {
                    b'n' => result.push(b'\n'),
                    b'r' => result.push(b'\r'),
                    b't' => result.push(b'\t'),
                    b'0'..=b'7' => {
                        let mut value = (escaped - b'0') as u32;
                        for _ in 0..2 {
                            match bytes.get(index + 1) {
                                Some(next @ b'0'..=b'7') => {
                                    value = value * 8 + (*next - b'0') as u32;
                                    index += 1;
                                }
                                _ => break,
                            }
                        }
                        result.push(value as u8);
                    }
                    other => result.push(other),
                }
            }
            b'(' => {
                depth += 1;
                result.push(byte);
            }
            b')' => {
                depth -= 1;
                if depth == 0 {
                    break;
                }
                result.push(byte);
            }
            other => result.push(other),
        }
        index += 1;
    }
    Some(decode(result))
}

/// Разбор hex-строки `<...>`; при BOM — UTF-16BE.
fn parse_hex(bytes: &[u8]) -> Option<String> {
    let end = bytes.iter().position(|byte| *byte == b'>')?;
    let digits: Vec<u8> = bytes[1..end]
        .iter()
        .copied()
        .filter(|byte| byte.is_ascii_hexdigit())
        .collect();
    if digits.len() < 2 {
        return Some(String::new());
    }
    let mut hex = String::from_utf8_lossy(&digits).to_string();
    if hex.len() % 2 != 0 {
        hex.push('0');
    }
    let data: Vec<u8> = (0..hex.len() / 2)
        .filter_map(|index| u8::from_str_radix(&hex[index * 2..index * 2 + 2], 16).ok())
        .collect();
    if data.starts_with(&[0xFE, 0xFF]) {
        let units: Vec<u16> = data[2..]
            .chunks_exact(2)
            .map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]]))
            .collect();
        return Some(String::from_utf16_lossy(&units));
    }
    Some(decode(data))
}

/// Декодирование байтов как UTF-8 с фолбэком на потерю.
fn decode(bytes: Vec<u8>) -> String {
    String::from_utf8_lossy(&bytes).into_owned()
}

/// Разделение строки авторов на список.
fn split_authors(value: &str) -> Vec<String> {
    value
        .split([';', '&'])
        .map(str::trim)
        .filter(|part| !part.is_empty())
        .map(str::to_string)
        .collect()
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
#[path = "pdf_tests.rs"]
mod tests;
