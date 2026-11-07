//! Сканирование директории книг generic-источника.
//!
//! Директория обходится рекурсивно; книга — отдельный файл формата `pdf`,
//! `djvu`, `epub` или `fb2`. Обход опирается на тип и метаданные записи из
//! `list_dir`, пропускает скрытые элементы и символические ссылки. Содержимое
//! файлов при обходе не читается: метаданные используются для инкрементального
//! сопоставления с индексом, а извлечение названия и авторов выполняется позже
//! только для новых и изменённых файлов.

use std::path::Path;

use super::fs::Fs;
use super::metadata;
use super::models::{EntryKind, ExternalBook, ExternalFile, ExternalFileKind, FileListing};

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

/// Рекурсивный обход директории с перечислением файлов книг без чтения.
pub(crate) fn list_files(fs: &impl Fs) -> Result<Vec<FileListing>, String> {
    let mut files = Vec::new();
    collect(fs, "", 0, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

/// Рекурсивный сбор файлов книг из директории.
fn collect(
    fs: &impl Fs,
    path: &str,
    depth: usize,
    files: &mut Vec<FileListing>,
) -> Result<(), String> {
    for entry in fs.list_dir(path)? {
        if is_hidden(&entry.name) || entry.kind == EntryKind::Symlink {
            continue;
        }
        let child = join(path, &entry.name);
        match entry.kind {
            EntryKind::Dir => {
                if depth < MAX_DEPTH {
                    collect(fs, &child, depth + 1, files)?;
                }
            }
            EntryKind::File => {
                if is_book_file(&entry.name) {
                    files.push(FileListing {
                        path: child,
                        format: extension(&entry.name),
                        size: entry.size,
                        mtime_ms: entry.mtime_ms,
                    });
                }
            }
            EntryKind::Symlink => {}
        }
    }
    Ok(())
}

/// Чтение книги и её обложки из файла.
///
/// Возвращает запись книги нейтрального каталога и, при наличии, байты обложки
/// с её форматом — для сохранения в индексе.
pub(crate) fn read_book(fs: &impl Fs, relative: &str) -> (ExternalBook, Option<(Vec<u8>, String)>) {
    let file_name = relative.rsplit('/').next().unwrap_or(relative);
    let format = extension(file_name);
    let metadata = metadata::extract(fs, relative, &format);
    let title = metadata
        .title
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| file_stem(file_name));
    let book = ExternalBook {
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
        language: metadata.language,
        published: metadata.published,
        publisher: metadata.publisher,
        description: metadata.description,
        identifier: metadata.identifier,
        ..ExternalBook::default()
    };
    (book, metadata.cover)
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
