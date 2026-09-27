//! Сканирование директории книг generic-источника.
//!
//! Директория обходится рекурсивно; книга — отдельный файл формата `pdf`,
//! `djvu`, `epub` или `fb2`. Обход опирается на тип записи из `list_dir`,
//! пропускает скрытые элементы и символические ссылки. Название и авторы
//! извлекаются анализаторами содержимого с фолбэком на имя файла.

use std::path::Path;

use super::fs::Fs;
use super::metadata;
use super::models::{EntryKind, ExternalBook, ExternalFile, ExternalFileKind};

/// Расширения файлов, считающихся книгой.
const BOOK_FORMATS: &[&str] = &["pdf", "djvu", "epub", "fb2"];

/// Страховочный предел глубины обхода (защита от аномальных структур).
const MAX_DEPTH: usize = 64;

/// Приоритет generic-источника при выборе source-плагина.
///
/// Ниже приоритета специализированных источников, чтобы не перехватывать их
/// директории.
pub(crate) const PROBE_PRIORITY: i32 = 1;

/// Проверка поддержки корня.
///
/// Generic-источник — базовый: он подтверждает любую доступную директорию и
/// используется последним, когда специализированные источники (например,
/// Calibre) её не признали. Пустая директория открывается как собственная
/// библиотека с пустым каталогом.
pub(crate) fn probe(fs: &impl Fs) -> Result<Option<i32>, String> {
    match fs.list_dir("") {
        Ok(_) => Ok(Some(PROBE_PRIORITY)),
        Err(_) => Ok(None),
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
fn collect(
    fs: &impl Fs,
    path: &str,
    depth: usize,
    books: &mut Vec<ExternalBook>,
) -> Result<(), String> {
    for entry in fs.list_dir(path)? {
        if is_hidden(&entry.name) || entry.kind == EntryKind::Symlink {
            continue;
        }
        let child = join(path, &entry.name);
        match entry.kind {
            EntryKind::Dir => {
                if depth < MAX_DEPTH {
                    collect(fs, &child, depth + 1, books)?;
                }
            }
            EntryKind::File => {
                if is_book_file(&entry.name) {
                    books.push(book_from_file(fs, &child));
                }
            }
            EntryKind::Symlink => {}
        }
    }
    Ok(())
}

/// Формирование записи книги из относительного пути файла.
fn book_from_file(fs: &impl Fs, relative: &str) -> ExternalBook {
    let file_name = relative.rsplit('/').next().unwrap_or(relative);
    let format = extension(file_name);
    let metadata = metadata::extract(fs, relative, &format);
    let title = metadata
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| file_stem(file_name));
    ExternalBook {
        id: relative.to_string(),
        title,
        authors: metadata.authors,
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
    BOOK_FORMATS.contains(&extension(name).as_str())
}

/// Расширение файла в нижнем регистре.
fn extension(name: &str) -> String {
    Path::new(name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// Имя файла без расширения.
fn file_stem(name: &str) -> String {
    Path::new(name)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(name)
        .to_string()
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
