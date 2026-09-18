//! Сканирование каталога книг базового плагина.
//!
//! Все чтения файловой системы выполняются через абстракцию `Fs`:
//! в WASM-окружении это host-функция `fs_list_dir`, в нативных тестах —
//! чтение локальных папок. Пути используются только относительные,
//! разделитель — `/`. Метаданные книги (название, автор) извлекаются из
//! структуры «автор/книга» и имён папок, без файлов метаданных.

use std::path::Path;

use super::fs::Fs;
use super::models::{ExternalBook, ExternalFile, ExternalFileKind};

/// Расширения файлов, считающихся содержимым книги.
const BOOK_FORMATS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "pdf", "fb2", "txt", "djvu", "rtf", "docx", "html",
];
/// Расширения файлов, считающихся обложкой.
const COVER_FORMATS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

/// Проверка пригодности корня в качестве библиотеки книг без полного сканирования.
///
/// Библиотекой считается корень, в котором на втором уровне вложенности есть
/// папка книги с хотя бы одним файлом книги в поддерживаемом формате.
pub(crate) fn probe(fs: &impl Fs) -> Result<bool, String> {
    for author in fs.list_dir("")? {
        if is_hidden(&author) {
            continue;
        }
        for book in fs.list_dir(&author)? {
            if is_hidden(&book) {
                continue;
            }
            let book_path = join(&author, &book);
            if fs.list_dir(&book_path)?.iter().any(is_book_file) {
                return Ok(true);
            }
        }
    }
    Ok(false)
}

/// Полное сканирование библиотеки.
///
/// Обходит папки авторов и книги внутри них, пропуская скрытые элементы и
/// корневые служебные файлы.
pub(crate) fn scan(fs: &impl Fs) -> Result<Vec<ExternalBook>, String> {
    let mut books = Vec::new();
    for author in fs.list_dir("")? {
        if is_hidden(&author) {
            continue;
        }
        for book in fs.list_dir(&author)? {
            if is_hidden(&book) {
                continue;
            }
            let book_path = join(&author, &book);
            if let Some(book) = scan_book(fs, &author, &book_path)? {
                books.push(book);
            }
        }
    }
    Ok(books)
}

/// Сканирование конкретной папки книги по известному пути.
///
/// Автор извлекается из первого сегмента относительного пути. Используется при
/// частичном обновлении индекса после изменения файлов.
pub(crate) fn scan_book_path(
    fs: &impl Fs,
    book_path: &str,
) -> Result<Option<ExternalBook>, String> {
    let author = book_path.split('/').next().unwrap_or("").to_string();
    scan_book(fs, &author, book_path)
}

/// Сканирование одной папки книги.
///
/// Возвращает `None`, если в папке нет ни одного файла содержимого книги.
fn scan_book(
    fs: &impl Fs,
    folder_author: &str,
    book_path: &str,
) -> Result<Option<ExternalBook>, String> {
    let entries = fs.list_dir(book_path)?;
    let mut files = Vec::new();
    let mut cover = None;
    for name in &entries {
        let file_path = join(book_path, name);
        if !fs.list_dir(&file_path)?.is_empty() {
            continue;
        }
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
    if let Some(cover) = cover {
        files.push(cover);
    }
    let title = book_path
        .rsplit('/')
        .next()
        .unwrap_or(book_path)
        .to_string();
    let authors = if folder_author.is_empty() {
        Vec::new()
    } else {
        vec![folder_author.to_string()]
    };
    Ok(Some(ExternalBook {
        title,
        authors,
        tags: Vec::new(),
        series: Vec::new(),
        files,
    }))
}

/// Является ли файл содержимым книги по его имени.
fn is_book_file(name: &String) -> bool {
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
