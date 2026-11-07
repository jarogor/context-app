//! Сканирование библиотеки Calibre.
//!
//! Библиотека Calibre хранится раскладкой «<автор>/<книга>». Название книги —
//! имя папки книги, авторы — имя родительской папки; при наличии `metadata.opf`
//! или EPUB метаданные уточняются из файла. Обход перечисляет файлы без чтения
//! содержимого; чтение выполняется только для новых и изменённых папок.

use std::path::Path;

use super::epub;
use super::fs::Fs;
use super::models::{BookListing, EntryKind, ExternalBook, ExternalFile, ExternalFileKind};
use super::opf;

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
/// с похожей вложенностью. Признаком служит именно `metadata.db`: обход
/// раскладки здесь не выполняется, чтобы распознавание было дешёвым и не
/// задерживало построение индекса.
pub(crate) fn probe(fs: &impl Fs) -> Result<Option<i32>, String> {
    let root = fs.list_dir("")?;
    if root
        .iter()
        .any(|entry| entry.kind == EntryKind::File && entry.name == "metadata.db")
    {
        return Ok(Some(PROBE_PRIORITY));
    }
    Ok(None)
}

/// Перечисление папок книг без чтения метаданных.
pub(crate) fn list_books(fs: &impl Fs) -> Result<Vec<BookListing>, String> {
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
            if let Some(listing) = list_book(fs, &author.name, &book_path)? {
                books.push(listing);
            }
        }
    }
    books.sort_by(|left, right| left.id.cmp(&right.id));
    Ok(books)
}

/// Перечисление файлов одной папки книги и построение её подписи.
fn list_book(
    fs: &impl Fs,
    folder_author: &str,
    book_path: &str,
) -> Result<Option<BookListing>, String> {
    let entries = fs.list_dir(book_path)?;
    let mut files = Vec::new();
    let mut cover = None;
    let mut opf = None;
    let mut signature_parts = Vec::new();
    let mut reliable = true;
    let mut content_size: Option<u64> = Some(0);
    let mut content_mtime_ms: Option<i64> = None;
    for entry in &entries {
        if entry.kind != EntryKind::File {
            continue;
        }
        if entry.size.is_none() || entry.mtime_ms.is_none() {
            reliable = false;
        }
        signature_parts.push(format!(
            "{}:{}:{}",
            entry.name,
            entry.size.unwrap_or_default(),
            entry.mtime_ms.unwrap_or_default()
        ));
        let name = &entry.name;
        let Some(extension) = Path::new(name).extension().and_then(|value| value.to_str()) else {
            continue;
        };
        let extension = extension.to_ascii_lowercase();
        let file_path = join(book_path, name);
        if is_book_file(name) {
            files.push(ExternalFile {
                kind: ExternalFileKind::Book,
                path: file_path.clone(),
                format: extension,
            });
            content_size = match (content_size, entry.size) {
                (Some(total), Some(size)) => Some(total + size),
                _ => None,
            };
            content_mtime_ms = content_mtime_ms.max(entry.mtime_ms);
        } else if Path::new(name).file_stem().and_then(|value| value.to_str()) == Some("cover")
            && COVER_FORMATS.contains(&extension.as_str())
        {
            cover = Some(ExternalFile {
                kind: ExternalFileKind::Cover,
                path: file_path,
                format: extension,
            });
        }
        if name.eq_ignore_ascii_case("metadata.opf") {
            opf = Some(name.clone());
        }
    }
    if files.is_empty() {
        return Ok(None);
    }
    files.sort_by(|left, right| left.path.cmp(&right.path));
    if let Some(cover) = cover {
        files.push(cover);
    }
    signature_parts.sort();
    Ok(Some(BookListing {
        id: book_path.to_string(),
        author: folder_author.to_string(),
        files,
        opf,
        signature: signature_parts.join("|"),
        reliable,
        size: content_size,
        mtime_ms: content_mtime_ms,
    }))
}

/// Построение книги с чтением `metadata.opf` или EPUB ради метаданных.
pub(crate) fn build_book(fs: &impl Fs, listing: &BookListing) -> ExternalBook {
    let mut title = listing
        .id
        .rsplit('/')
        .next()
        .unwrap_or(&listing.id)
        .to_string();
    let mut authors = if listing.author.is_empty() {
        Vec::new()
    } else {
        vec![listing.author.clone()]
    };
    let mut series = Vec::new();
    let mut tags = Vec::new();
    let mut language: Option<String> = None;
    let mut published: Option<String> = None;
    let mut publisher: Option<String> = None;
    let mut description: Option<String> = None;
    let mut identifier: Option<String> = None;

    // Основной источник метаданных Calibre — `metadata.opf` в папке книги.
    if let Some(opf_name) = &listing.opf {
        if let Ok(bytes) = fs.read_bytes(&join(&listing.id, opf_name)) {
            let metadata = opf::extract(&bytes);
            if let Some(value) = metadata.title.filter(|value| !value.trim().is_empty()) {
                title = value;
            }
            if !metadata.authors.is_empty() {
                authors = metadata.authors;
            }
            if let Some(value) = metadata.series {
                series.push(value);
            }
            tags = metadata.tags;
            language = metadata.language;
            published = metadata.published;
            publisher = metadata.publisher;
            description = metadata.description;
            identifier = metadata.identifier;
        }
    } else if let Some(epub_file) = listing
        .files
        .iter()
        .find(|file| file.format == "epub" && matches!(file.kind, ExternalFileKind::Book))
    {
        // Фолбэк: метаданные из EPUB, если `metadata.opf` отсутствует.
        if let Ok(bytes) = fs.read_bytes(&epub_file.path) {
            if let Ok(metadata) = epub::extract(&bytes) {
                if let Some(value) = metadata.title.filter(|value| !value.is_empty()) {
                    title = value;
                }
                if !metadata.authors.is_empty() {
                    authors = metadata.authors;
                }
                language = metadata.language;
                published = metadata.published;
                publisher = metadata.publisher;
                description = metadata.description;
                identifier = metadata.identifier;
            }
        }
    }

    ExternalBook {
        id: listing.id.clone(),
        title,
        authors,
        tags,
        series,
        files: listing.files.clone(),
        language,
        published,
        publisher,
        description,
        identifier,
        size: listing.size,
        ..ExternalBook::default()
    }
}

/// Обложка из файла `cover.*` рядом с файлом книги.
///
/// Библиотека адресуется файлом книги (`<автор>/<книга>/<файл>`), а обложка
/// Calibre лежит в той же папке отдельным файлом `cover.jpg`. Папка книги —
/// родительская для переданного пути; в ней ищется файл с базовым именем
/// `cover` и расширением из допустимых. Возвращает байты и формат обложки.
pub(crate) fn sibling_cover(fs: &impl Fs, path: &str) -> Result<Option<(Vec<u8>, String)>, String> {
    let folder = match path.rsplit_once('/') {
        Some((folder, _)) => folder,
        None => "",
    };
    let entries = fs.list_dir(folder)?;
    for entry in &entries {
        if entry.kind != EntryKind::File {
            continue;
        }
        let Some(extension) = Path::new(&entry.name)
            .extension()
            .and_then(|value| value.to_str())
        else {
            continue;
        };
        let extension = extension.to_ascii_lowercase();
        if Path::new(&entry.name)
            .file_stem()
            .and_then(|value| value.to_str())
            == Some("cover")
            && COVER_FORMATS.contains(&extension.as_str())
        {
            let cover_path = join(folder, &entry.name);
            return Ok(Some((fs.read_bytes(&cover_path)?, extension)));
        }
    }
    Ok(None)
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
