//! Переносимый файл набора заметок: выгрузка и разбор при импорте.
//!
//! Файл набора — документ плагина заметок: метка формата, версия, время
//! выгрузки, описание книги и сам набор с заметками.
//!
//! **Книга описывается, а не адресуется.** Путь к файлу книги в документ не
//! попадает: один и тот же файл может лежать по разным путям, а набор
//! принадлежит книге. Локальный путь выбирается при импорте — по имени файла
//! книги и названию.
//!
//! Живучесть важнее педантичности: принимается и файл без оболочки (просто
//! набор с заметками), а метка формата и версия, если они есть, проверяются.

use crate::models::{
    NoteSet, PortableDocument, PortableSet, DOCUMENT_EXTENSION, DOCUMENT_FORMAT, DOCUMENT_VERSION,
};

/// Предел длины имени файла экспорта в символах.
const FILE_NAME_LIMIT: usize = 60;

/// Имя файла экспорта по имени набора.
///
/// Всё, что не похоже на часть имени файла, заменяется дефисом: имя набора
/// приходит от пользователя и может содержать что угодно. Пустое имя даёт
/// общее `notes`.
pub fn export_file_name(name: &str) -> String {
    let mut stem = String::new();
    let mut previous_dash = false;
    // Ограничение по числу исходных символов: каждый символ даёт не больше одного.
    for symbol in name.trim().chars().take(FILE_NAME_LIMIT) {
        if symbol.is_alphanumeric() {
            stem.push(symbol);
            previous_dash = false;
        } else if !previous_dash && !stem.is_empty() {
            stem.push('-');
            previous_dash = true;
        }
    }
    let stem = stem.trim_matches('-');
    if stem.is_empty() {
        format!("notes{DOCUMENT_EXTENSION}")
    } else {
        format!("{stem}{DOCUMENT_EXTENSION}")
    }
}

/// Документ файла набора заметок: текст в переносимом формате.
///
/// `book_name` — имя файла книги, известное вызывающей стороне из источника;
/// место хранения книги в документ не попадает.
pub fn document(set: &NoteSet, book_name: &str, exported_at_millis: i64) -> Result<String, String> {
    let value = serde_json::json!({
        "format": DOCUMENT_FORMAT,
        "version": DOCUMENT_VERSION,
        "exported_at_millis": exported_at_millis,
        "book": {
            "name": book_name.trim(),
            "title": set.book_title.trim(),
        },
        "set": {
            "name": set.name,
            "created_at_millis": set.created_at_millis,
            "notes": set.notes,
        },
    });
    serde_json::to_string_pretty(&value)
        .map_err(|error| format!("набор заметок не удалось выгрузить: {error}"))
}

/// Документ из текста файла импорта.
///
/// Модель набора переносится как есть; метка формата, если она есть, должна
/// совпадать, а версия — не превышать известную: файл из будущего не
/// разбирается наугад.
pub fn parse_document(text: &str) -> Result<PortableDocument, String> {
    let text = text.trim_start_matches('\u{feff}').trim();
    if text.is_empty() {
        return Err("файл набора заметок пуст".to_string());
    }
    let value: serde_json::Value = serde_json::from_str(text)
        .map_err(|error| format!("файл набора заметок не читается: {error}"))?;
    if let Some(format) = value.get("format").and_then(serde_json::Value::as_str) {
        if format != DOCUMENT_FORMAT {
            return Err(format!("это не файл набора заметок: {format}"));
        }
    }
    if let Some(version) = value.get("version").and_then(serde_json::Value::as_u64) {
        if version > u64::from(DOCUMENT_VERSION) {
            return Err("файл набора заметок создан более новой версией приложения".to_string());
        }
    }
    let book = value
        .get("book")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("описание книги в файле не читается: {error}"))?
        .unwrap_or_default();
    let set_value = value.get("set").cloned().unwrap_or_else(|| value.clone());
    let set: PortableSet = serde_json::from_value(set_value)
        .map_err(|error| format!("файл набора заметок не читается: {error}"))?;
    Ok(PortableDocument { book, set })
}

#[cfg(test)]
#[path = "portable_tests.rs"]
mod tests;
