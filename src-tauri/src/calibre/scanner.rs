//! Сканирование файловой структуры Calibre.

use std::fs;
use std::path::{Path, PathBuf};

use super::metadata;

#[derive(Debug, Clone)]
pub(crate) struct ScannedBook {
    pub title: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Vec<(String, i64)>,
    pub files: Vec<ScannedFile>,
}

#[derive(Debug, Clone)]
pub(crate) struct ScannedFile {
    pub kind: ScannedFileKind,
    pub path: PathBuf,
    pub format: String,
}

#[derive(Debug, Clone, Copy)]
pub(crate) enum ScannedFileKind {
    Book,
    Cover,
}

const BOOK_FORMATS: &[&str] = &[
    "epub", "mobi", "azw", "azw3", "pdf", "fb2", "txt", "djvu", "rtf", "docx", "html",
];
const COVER_FORMATS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp"];

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

pub(crate) fn scan_book_directory(
    root: &Path,
    author: &str,
    path: &Path,
) -> Result<Option<ScannedBook>, std::io::Error> {
    scan_book(root, author, path)
}

fn title_from_folder(folder: &str) -> String {
    folder
        .rsplit_once(" (")
        .map(|(title, _)| title)
        .unwrap_or(folder)
        .to_string()
}

fn is_hidden(name: &str) -> bool {
    name.starts_with('.')
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::scan;
    use crate::test_util;

    #[test]
    fn scans_books_and_ignores_root_noise() {
        let root = test_util::test_root("calibre-scan");
        test_util::cleanup(&root);
        let book = root.join("Автор").join("Название (42)");
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(book.join("metadata.opf"), "<package><metadata/></package>").expect("запись OPF");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");
        fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");
        fs::write(root.join("metadata.db"), "noise").expect("запись шума");
        fs::create_dir_all(root.join(".hidden")).expect("создание скрытой папки");

        let books = scan(&root).expect("сканирование");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].title, "Название");
        assert_eq!(books[0].authors, ["Автор"]);
        assert_eq!(books[0].files.len(), 2);

        test_util::cleanup(&root);
    }

    #[test]
    fn uses_cover_declared_in_opf_when_default_cover_is_missing() {
        let root = test_util::test_root("calibre-opf-cover");
        test_util::cleanup(&root);
        let book = root.join("Автор").join("Книга (8)");
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(
            book.join("metadata.opf"),
            r#"<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata>
                <dc:title>Книга</dc:title><meta name="cover" content="front.png"/>
            </metadata></package>"#,
        )
        .expect("запись OPF");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");
        fs::write(book.join("front.png"), "cover").expect("запись обложки");

        let books = scan(&root).expect("сканирование");

        assert_eq!(books.len(), 1);
        assert_eq!(books[0].files.len(), 2);
        assert!(books[0]
            .files
            .iter()
            .any(|file| matches!(file.kind, super::ScannedFileKind::Cover)));

        test_util::cleanup(&root);
    }

    #[test]
    fn falls_back_to_folder_metadata_when_opf_is_invalid() {
        let root = test_util::test_root("calibre-invalid-opf");
        test_util::cleanup(&root);
        let book = root.join("Автор").join("Название (9)");
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(book.join("metadata.opf"), "<package>").expect("запись повреждённого OPF");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");

        let books = scan(&root).expect("сканирование");

        assert_eq!(books[0].title, "Название");
        assert_eq!(books[0].authors, ["Автор"]);
        test_util::cleanup(&root);
    }

    #[test]
    fn scans_multiple_authors_and_books() {
        let root = test_util::test_root("calibre-multiple-books");
        test_util::cleanup(&root);
        for (author, title) in [
            ("Автор 1", "Книга 1"),
            ("Автор 1", "Книга 2"),
            ("Автор 2", "Книга 3"),
        ] {
            let book = root.join(author).join(format!("{title} (1)"));
            fs::create_dir_all(&book).expect("создание папки книги");
            fs::write(book.join("book.epub"), "epub").expect("запись книги");
        }

        let books = scan(&root).expect("сканирование");

        assert_eq!(books.len(), 3);
        test_util::cleanup(&root);
    }
}
