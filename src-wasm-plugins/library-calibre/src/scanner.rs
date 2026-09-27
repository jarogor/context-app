//! Сканирование библиотеки Calibre.
//!
//! Библиотека Calibre хранится раскладкой «<автор>/<книга>». Название книги —
//! имя папки книги, авторы — имя родительской папки; при наличии EPUB метаданные
//! уточняются из файла. Все чтения выполняются через абстракцию `Fs`.

use std::path::Path;

use super::epub;
use super::fs::Fs;
use super::models::{EntryKind, ExternalBook, ExternalFile, ExternalFileKind};

/// Расширения файлов, считающихся содержимым книги.
const BOOK_FORMATS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "pdf", "fb2", "txt", "djvu", "rtf", "docx", "html",
];
/// Расширения файлов, считающихся обложкой.
const COVER_FORMATS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

/// Приоритет Calibre при выборе source-плагина: выше generic-источника.
pub(crate) const PROBE_PRIORITY: i32 = 10;

/// Проверка, что корень имеет структуру библиотеки Calibre.
///
/// Библиотека Calibre всегда содержит файл `metadata.db` в корне; без него
/// директория не признаётся Calibre, чтобы не перехватывать произвольные папки
/// с похожей вложенностью. Дополнительно требуется папка книги с файлами книг.
pub(crate) fn probe(fs: &impl Fs) -> Result<Option<i32>, String> {
    let root = fs.list_dir("")?;
    if !root
        .iter()
        .any(|entry| entry.kind == EntryKind::File && entry.name == "metadata.db")
    {
        return Ok(None);
    }
    for author in root {
        if is_hidden(&author.name) || author.kind != EntryKind::Dir {
            continue;
        }
        for book in fs.list_dir(&author.name)? {
            if is_hidden(&book.name) || book.kind != EntryKind::Dir {
                continue;
            }
            let book_path = join(&author.name, &book.name);
            if fs
                .list_dir(&book_path)?
                .iter()
                .any(|entry| entry.kind == EntryKind::File && is_book_file(&entry.name))
            {
                return Ok(Some(PROBE_PRIORITY));
            }
        }
    }
    Ok(None)
}

/// Полное сканирование библиотеки Calibre.
pub(crate) fn scan(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let mut books = Vec::new();
    for author in fs.list_dir("")? {
        if is_hidden(&author.name) || author.kind != EntryKind::Dir {
            continue;
        }
        for book in fs.list_dir(&author.name)? {
            if is_hidden(&book.name) || book.kind != EntryKind::Dir {
                continue;
            }
            let book_path = join(&author.name, &book.name);
            if let Some(entry) = scan_book(fs, &author.name, &book_path)? {
                books.push(entry);
            }
        }
    }
    Ok(books)
}

/// Сканирование одной папки книги с обогащением метаданных из EPUB.
fn scan_book(
    fs: &impl Fs,
    folder_author: &str,
    book_path: &str,
) -> Result<Option<ExternalBook>, String> {
    let entries = fs.list_dir(book_path)?;
    let mut files = Vec::new();
    let mut cover = None;
    for entry in &entries {
        if entry.kind != EntryKind::File {
            continue;
        }
        let name = &entry.name;
        let file_path = join(book_path, name);
        let Some(extension) = Path::new(name).extension().and_then(|value| value.to_str()) else {
            continue;
        };
        let extension = extension.to_ascii_lowercase();
        if is_book_file(name) {
            files.push(ExternalFile {
                kind: ExternalFileKind::Book,
                path: file_path.clone(),
                format: extension,
            });
        } else if Path::new(name).file_stem().and_then(|value| value.to_str()) == Some("cover")
            && COVER_FORMATS.contains(&extension.as_str())
        {
            cover = Some(ExternalFile {
                kind: ExternalFileKind::Cover,
                path: file_path.clone(),
                format: extension,
            });
        }
    }
    if files.is_empty() {
        return Ok(None);
    }

    files.sort_by(|left, right| left.path.cmp(&right.path));

    let mut title = book_path
        .rsplit('/')
        .next()
        .unwrap_or(book_path)
        .to_string();
    let mut authors = if folder_author.is_empty() {
        Vec::new()
    } else {
        vec![folder_author.to_string()]
    };
    if let Some(epub_file) = files.iter().find(|file| file.format == "epub") {
        if let Ok(bytes) = fs.read_bytes(&epub_file.path) {
            if let Ok((epub_title, epub_authors)) = epub::parse_epub_metadata(&bytes) {
                if !epub_title.is_empty() {
                    title = epub_title;
                }
                if !epub_authors.is_empty() {
                    authors = epub_authors;
                }
            }
        }
    }

    if let Some(cover) = cover {
        files.push(cover);
    }
    Ok(Some(ExternalBook {
        id: book_path.to_string(),
        title,
        authors,
        tags: Vec::new(),
        series: Vec::new(),
        files,
    }))
}

/// Является ли файл содержимым книги по его имени.
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
