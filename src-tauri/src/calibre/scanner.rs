//! Сканирование файловой структуры Calibre.

use std::fs;
use std::path::Path;

use super::metadata;
use super::models::{ScannedBook, ScannedFile, ScannedFileKind};

/// Расширения файлов, считающихся содержимым книги.
const BOOK_FORMATS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "pdf", "fb2", "txt", "djvu", "rtf", "docx", "html",
];
/// Расширения файлов, считающихся обложкой.
const COVER_FORMATS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

/// Полное сканирование библиотеки Calibre.
///
/// Обходит папки авторов и книги внутри них, пропуская скрытые элементы и
/// корневые служебные файлы вроде `metadata.db`.
pub(crate) fn scan(root: &Path) -> Result<Vec<ScannedBook>, std::io::Error> {
    let mut books = Vec::new();
    for author in fs::read_dir(root)? {
        let author = author?;
        if !author.path().is_dir() || is_hidden(&author.file_name().to_string_lossy()) {
            continue;
        }
        for directory in fs::read_dir(author.path())? {
            let directory = directory?;
            if !directory.path().is_dir() {
                continue;
            }
            let book = scan_book(
                root,
                &author.file_name().to_string_lossy(),
                &directory.path(),
            )?;
            if let Some(book) = book {
                books.push(book);
            }
        }
    }
    Ok(books)
}

/// Сканирование одной папки книги.
///
/// Возвращает `None`, если в папке нет ни одного файла содержимого книги.
fn scan_book(
    root: &Path,
    folder_author: &str,
    path: &Path,
) -> Result<Option<ScannedBook>, std::io::Error> {
    let mut files = Vec::new();
    let mut cover = None;
    for entry in fs::read_dir(path)? {
        let entry = entry?;
        let file = entry.path();
        if !file.is_file() {
            continue;
        }
        let Some(extension) = file.extension().and_then(|value| value.to_str()) else {
            continue;
        };
        let extension = extension.to_ascii_lowercase();
        let relative = file.strip_prefix(root).unwrap_or(&file).to_path_buf();
        if BOOK_FORMATS.contains(&extension.as_str()) {
            files.push(ScannedFile {
                kind: ScannedFileKind::Book,
                path: relative,
                format: extension,
            });
        } else if file.file_stem().and_then(|value| value.to_str()) == Some("cover")
            && COVER_FORMATS.contains(&extension.as_str())
        {
            cover = Some(ScannedFile {
                kind: ScannedFileKind::Cover,
                path: relative,
                format: extension,
            });
        }
    }
    if files.is_empty() {
        return Ok(None);
    }

    let fallback_title = title_from_folder(
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("Без названия"),
    );
    let parsed = metadata::parse(&path.join("metadata.opf")).unwrap_or_default();
    if cover.is_none() {
        if let Some(name) = parsed.cover.as_deref() {
            let candidate = path.join(name);
            if candidate.is_file() {
                if let Some(extension) = candidate.extension().and_then(|value| value.to_str()) {
                    let extension = extension.to_ascii_lowercase();
                    if COVER_FORMATS.contains(&extension.as_str()) {
                        cover = Some(ScannedFile {
                            kind: ScannedFileKind::Cover,
                            path: candidate
                                .strip_prefix(root)
                                .unwrap_or(&candidate)
                                .to_path_buf(),
                            format: extension,
                        });
                    }
                }
            }
        }
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    if let Some(cover) = cover {
        files.push(cover);
    }
    let title = parsed.title.unwrap_or(fallback_title);
    let authors = if parsed.authors.is_empty() {
        vec![folder_author.to_string()]
    } else {
        parsed.authors
    };
    let series = parsed.series.into_iter().collect();
    Ok(Some(ScannedBook {
        title,
        authors,
        tags: parsed.tags,
        series,
        files,
    }))
}

/// Сканирование конкретной папки книги по имени автора.
///
/// Используется при частичном обновлении индекса после изменения файлов.
pub(crate) fn scan_book_directory(
    root: &Path,
    author: &str,
    path: &Path,
) -> Result<Option<ScannedBook>, std::io::Error> {
    scan_book(root, author, path)
}

/// Название книги из имени папки: отбрасывает суффикс Calibre ` (id)`.
fn title_from_folder(folder: &str) -> String {
    folder
        .rsplit_once(" (")
        .map(|(title, _)| title)
        .unwrap_or(folder)
        .to_string()
}

/// Проверка, что имя начинается с точки (скрытый элемент).
fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

#[cfg(test)]
#[path = "scanner_tests.rs"]
mod tests;
