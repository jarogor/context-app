//! Импорт книг в библиотеку.
//!
//! Сервис оркеструет разбор EPUB, запись метаданных и копирование файлов
//! в портируемую директорию. Импорт атомаре́н по отношению к базе данных:
//! повреждённый файл отклоняется до внесения изменений.

pub mod epub_parser;
pub mod error;

use std::fs;
use std::path::{Path, PathBuf};

use crate::catalog::repository::{get_or_create_author, insert_book, insert_file, link_authors};
use crate::catalog::{CatalogError, FileKind};
use crate::library::Library;

use self::epub_parser::extract_metadata;
use self::error::ImportError;

/// Хранилище данных импортированной книги на диске.
struct WrittenFiles {
    book_relative_path: String,
    cover_relative_path: Option<String>,
    cover_format: Option<String>,
}

/// Импорт книги в библиотеку из файла EPUB.
///
/// Парсинг выполняется до записи в базу; при ошибке разбора файл не
/// попадает в библиотеку и записи не создаются.
pub fn import_book(
    library: &mut Library,
    source_path: &Path,
) -> Result<crate::catalog::Book, ImportError> {
    let metadata = extract_metadata(source_path)?;

    let title = metadata
        .title
        .clone()
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| title_from_filename(source_path));

    let books_dir_abs = library.books_dir_abs();
    let covers_dir_abs = library.covers_dir_abs();
    let books_dir = library.books_dir().to_string();
    let covers_dir = library.covers_dir().to_string();

    let connection = library.connection_mut();
    let transaction = connection.transaction()?;

    let uuid = uuid::Uuid::new_v4().to_string();
    let book_id = insert_book(&transaction, &uuid, &title)?;

    let author_ids = metadata
        .authors
        .iter()
        .map(|name| get_or_create_author(&transaction, name))
        .collect::<Result<Vec<_>, _>>()?;
    link_authors(&transaction, book_id, &author_ids)?;

    let written = write_book_files(
        &books_dir_abs,
        &covers_dir_abs,
        &books_dir,
        &covers_dir,
        book_id,
        source_path,
        &metadata,
    )?;

    insert_file(
        &transaction,
        book_id,
        FileKind::Book,
        &written.book_relative_path,
        "epub",
    )?;
    if let (Some(cover_path), Some(cover_format)) =
        (&written.cover_relative_path, &written.cover_format)
    {
        insert_file(
            &transaction,
            book_id,
            FileKind::Cover,
            cover_path,
            cover_format,
        )?;
    }

    transaction.commit()?;

    crate::catalog::repository::get_book(connection, book_id)
        .map_err(ImportError::Catalog)?
        .ok_or_else(|| ImportError::Catalog(CatalogError::NotFound))
}

/// Название книги по имени исходного файла (для EPUB без метаданных).
fn title_from_filename(source_path: &Path) -> String {
    source_path
        .file_stem()
        .map(|stem| stem.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Без названия".to_string())
}

/// Копирование файла книги и обложки в портируемую директорию.
///
/// Имена файлов уникальны за счёт префикса `book_id`.
fn write_book_files(
    books_dir_abs: &Path,
    covers_dir_abs: &Path,
    books_dir: &str,
    covers_dir: &str,
    book_id: i64,
    source_path: &Path,
    metadata: &epub_parser::ExtractedMetadata,
) -> Result<WrittenFiles, ImportError> {
    let book_file_name = format!("{book_id}.epub");
    let book_dest = books_dir_abs.join(&book_file_name);
    fs::copy(source_path, &book_dest)?;

    let mut cover_relative_path = None;
    let mut cover_format = None;
    if let Some(cover) = &metadata.cover {
        let cover_file_name = format!("{book_id}.{}", cover.format);
        let cover_dest = covers_dir_abs.join(&cover_file_name);
        fs::write(&cover_dest, &cover.bytes)?;
        cover_relative_path = Some(
            PathBuf::from(covers_dir)
                .join(&cover_file_name)
                .to_string_lossy()
                .into_owned(),
        );
        cover_format = Some(cover.format.clone());
    }

    Ok(WrittenFiles {
        book_relative_path: PathBuf::from(books_dir)
            .join(&book_file_name)
            .to_string_lossy()
            .into_owned(),
        cover_relative_path,
        cover_format,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::open_catalog_at;
    use crate::library::Library;
    use crate::test_util;
    use std::io::Write;
    use std::path::PathBuf;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn temp_root(name: &str) -> PathBuf {
        test_util::test_root(name)
    }

    fn make_minimal_epub(
        path: &Path,
        title: Option<&str>,
        creator: Option<&str>,
        cover: Option<(&str, &[u8])>,
    ) {
        let file = fs::File::create(path).expect("создание файла EPUB");
        let mut zip = ZipWriter::new(file);
        let options = SimpleFileOptions::default();

        let title_entry = title
            .map(|t| format!("<dc:title>{t}</dc:title>"))
            .unwrap_or_default();
        let creator_entry = creator
            .map(|c| format!("<dc:creator>{c}</dc:creator>"))
            .unwrap_or_default();
        let cover_entry = cover
            .map(|(id, _)| format!(r#"<meta name="cover" content="{id}"/>"#))
            .unwrap_or_default();
        let cover_item = cover
            .map(|(id, _)| format!(r#"<item id="{id}" media-type="image/jpeg" href="{id}.jpg"/>"#))
            .unwrap_or_default();

        let container = "<?xml version=\"1.0\"?><container version=\"1.0\" xmlns=\"urn:oasis:names:tc:opendocument:xmlns:container\"><rootfiles><rootfile full-path=\"OEBPS/content.opf\" media-type=\"application/oebps-package+xml\"/></rootfiles></container>";
        zip.start_file("META-INF/container.xml", options)
            .expect("запись container");
        zip.write_all(container.as_bytes())
            .expect("запись содержимого");

        let opf = format!(
            r#"<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    {title_entry}
    {creator_entry}
    {cover_entry}
  </metadata>
  <manifest>
    <item id="nav" media-type="application/xhtml+xml" href="nav.xhtml"/>
    <item id="content" media-type="application/xhtml+xml" href="content.xhtml"/>
    {cover_item}
  </manifest>
  <spine toc="nav">
    <itemref idref="content"/>
  </spine>
</package>"#
        );
        zip.start_file("OEBPS/content.opf", options)
            .expect("запись opf");
        zip.write_all(opf.as_bytes()).expect("запись содержимого");

        let content = r#"<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>Hello</p></body></html>"#;
        zip.start_file("OEBPS/content.xhtml", options)
            .expect("запись xhtml");
        zip.write_all(content.as_bytes())
            .expect("запись содержимого");

        if let Some((id, data)) = cover {
            zip.start_file(format!("OEBPS/{id}.jpg"), options)
                .expect("запись обложки");
            zip.write_all(data).expect("запись содержимого");
        }

        zip.finish().expect("завершение архива");
    }

    fn make_broken_file(path: &Path) {
        fs::write(path, b"this is not a valid epub archive").expect("запись битого файла");
    }

    fn cleanup(name: &str) {
        let _ = name;
    }

    #[test]
    fn import_copies_file_with_book_id_prefix_and_no_overwrite_on_conflict() {
        let root = temp_root("import-unique-name");
        let epub_path = root.join("source-му copy.epub");
        make_minimal_epub(&epub_path, Some("Книга"), Some("Автор"), None);

        let library_root = root.join("library");
        let mut library = Library::open(&library_root).expect("открытие библиотеки");
        open_catalog_at(&library_root.join("library.db")).expect("открытие каталога");

        let book = import_book(&mut library, &epub_path).expect("импорт книги");

        let expected_name = format!("{}.epub", book.id);
        let expected_path = library_root.join("books").join(&expected_name);
        assert!(
            expected_path.exists(),
            "файл скопирован с префиксом book_id"
        );
        assert_eq!(
            book.files
                .iter()
                .find(|f| f.kind == FileKind::Book)
                .unwrap()
                .path,
            format!("books/{expected_name}")
        );

        // Второй импорт той же книги создаёт отдельный файл без перезаписи
        let book2 = import_book(&mut library, &epub_path).expect("повторный импорт");
        let expected_name2 = format!("{}.epub", book2.id);
        assert_ne!(book.id, book2.id, "создана отдельная запись");
        assert!(
            library_root.join("books").join(&expected_name2).exists(),
            "второй файл создан без перезаписи"
        );
        assert!(
            library_root.join("books").join(&expected_name).exists(),
            "первый файл не перезаписан"
        );

        fs::remove_dir_all(&library_root).expect("очистка");
    }

    #[test]
    fn import_extracts_metadata_and_cover() {
        let root = temp_root("import-metadata");
        let epub_path = root.join("book.epub");
        let cover_bytes = b"\xff\xd8\xff\xe0fakejpeg";
        make_minimal_epub(
            &epub_path,
            Some("Заголовок"),
            Some("Писатель"),
            Some(("cover", cover_bytes)),
        );

        let library_root = root.join("library");
        let mut library = Library::open(&library_root).expect("открытие библиотеки");
        open_catalog_at(&library_root.join("library.db")).expect("открытие каталога");

        let book = import_book(&mut library, &epub_path).expect("импорт книги");
        assert_eq!(book.title, "Заголовок");
        assert_eq!(book.authors.len(), 1);
        assert_eq!(book.authors[0].name, "Писатель");

        let cover_file = book
            .files
            .iter()
            .find(|f| f.kind == FileKind::Cover)
            .expect("обложка в записях файлов");
        let cover_abs = library_root.join(&cover_file.path);
        assert!(cover_abs.exists(), "файл обложки создан");
        assert_eq!(
            fs::read(&cover_abs).expect("чтение обложки").as_slice(),
            cover_bytes
        );

        fs::remove_dir_all(&library_root).expect("очистка");
    }

    #[test]
    fn import_without_metadata_uses_defaults() {
        let root = temp_root("import-defaults");
        let epub_path = root.join("Без заголовка.epub");
        make_minimal_epub(&epub_path, None, None, None);

        let library_root = root.join("library");
        let mut library = Library::open(&library_root).expect("открытие библиотеки");
        open_catalog_at(&library_root.join("library.db")).expect("открытие каталога");

        let book = import_book(&mut library, &epub_path).expect("импорт книги");
        assert_eq!(book.title, "Без заголовка", "название из имени файла");
        assert!(book.authors.is_empty(), "авторы отсутствуют");
        assert!(
            !book.files.iter().any(|f| f.kind == FileKind::Cover),
            "обложка отсутствует"
        );

        fs::remove_dir_all(&library_root).expect("очистка");
    }

    #[test]
    fn import_broken_file_keeps_database_unchanged() {
        let root = temp_root("import-broken");
        let broken_path = root.join("broken.epub");
        make_broken_file(&broken_path);

        let library_root = root.join("library");
        let mut library = Library::open(&library_root).expect("открытие библиотеки");
        open_catalog_at(&library_root.join("library.db")).expect("открытие каталога");

        let result = import_book(&mut library, &broken_path);
        assert!(result.is_err(), "битый файл отклоняется");

        let connection =
            open_catalog_at(&library_root.join("library.db")).expect("повторное открытие каталога");
        let count: i64 = connection
            .query_row("SELECT COUNT(*) FROM books;", [], |row| row.get(0))
            .expect("число записей");
        assert_eq!(count, 0, "записи не созданы");
        let books_dir_empty = fs::read_dir(library_root.join("books"))
            .expect("чтение папки books")
            .next()
            .is_none();
        assert!(books_dir_empty, "файлы не скопированы");

        fs::remove_dir_all(&library_root).expect("очистка");
        cleanup("import-broken");
    }
}
