//! Сканирование директории книг generic-источника.
//!
//! Директория обходится рекурсивно; каждая книга — **отдельный файл**
//! поддерживаемого формата. Название берётся из имени файла; автор и обложка
//! не определяются. Все чтения файловой системы выполняются через абстракцию
//! `Fs`: в WASM-окружении это host-функция `fs_list_dir`, в нативных тестах —
//! чтение локальных папок. Пути используются только относительные, разделитель
//! — `/`.

use std::path::Path;

use super::fs::Fs;
use super::models::{ExternalBook, ExternalFile, ExternalFileKind};

/// Расширения файлов, считающихся книгой.
const BOOK_FORMATS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "pdf", "fb2", "txt", "djvu", "rtf", "docx", "html",
];

/// Максимальная глубина рекурсивного обхода подпапок.
const MAX_DEPTH: usize = 8;

/// Приоритет generic-источника при выборе source-плагина.
///
/// Ниже приоритета специализированных источников, чтобы не перехватывать их
/// директории.
pub(crate) const PROBE_PRIORITY: i32 = 1;

/// Проверка поддержки корня без полного сканирования.
///
/// Возвращает приоритет источника, если найден хотя бы один файл книги, и
/// `None`, если книг нет.
pub(crate) fn probe(fs: &impl Fs) -> Result<Option<i32>, String> {
    if contains_book(fs, "", 0)? {
        Ok(Some(PROBE_PRIORITY))
    } else {
        Ok(None)
    }
}

/// Полное рекурсивное сканирование директории книг.
pub(crate) fn scan(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let mut books = Vec::new();
    collect(fs, "", 0, &mut books)?;
    books.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(books)
}

/// Рекурсивный сбор книг из директории.
fn collect(fs: &impl Fs, path: &str, depth: usize, books: &mut Vec<ExternalBook>) -> Result<(), String> {
    for name in fs.list_dir(path)? {
        if is_hidden(&name) {
            continue;
        }
        let child = join(path, &name);
        if is_book_file(&name) {
            books.push(book_from_file(&child));
            continue;
        }
        if depth < MAX_DEPTH && !fs.list_dir(&child)?.is_empty() {
            collect(fs, &child, depth + 1, books)?;
        }
    }
    Ok(())
}

/// Поиск хотя бы одного файла книги с ранним выходом.
fn contains_book(fs: &impl Fs, path: &str, depth: usize) -> Result<bool, String> {
    for name in fs.list_dir(path)? {
        if is_hidden(&name) {
            continue;
        }
        if is_book_file(&name) {
            return Ok(true);
        }
        let child = join(path, &name);
        if depth < MAX_DEPTH
            && !fs.list_dir(&child)?.is_empty()
            && contains_book(fs, &child, depth + 1)?
        {
            return Ok(true);
        }
    }
    Ok(false)
}

/// Формирование записи книги из относительного пути файла.
fn book_from_file(relative: &str) -> ExternalBook {
    let file_name = relative.rsplit('/').next().unwrap_or(relative);
    let title = Path::new(file_name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(file_name)
        .to_string();
    let format = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    ExternalBook {
        id: relative.to_string(),
        title,
        authors: Vec::new(),
        tags: Vec::new(),
        series: Vec::new(),
        files: vec![ExternalFile {
            kind: ExternalFileKind::Book,
            path: relative.to_string(),
            format,
        }],
    }
}

/// Является ли файл книгой по его расширению.
fn is_book_file(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| BOOK_FORMATS.contains(&extension.to_ascii_lowercase().as_str()))
}

/// Объединение сегментов относительного пути через `/`.
fn join(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

/// Проверка, что имя начинается с точки (скрытый элемент).
fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

#[cfg(test)]
#[path = "scanner_tests.rs"]
mod tests;
