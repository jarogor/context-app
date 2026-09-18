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
fn import_is_rejected_for_external_library() {
    let root = test_util::test_root("import-external-read-only");
    test_util::cleanup(&root);
    let book = root.join("Автор").join("Книга (1)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("metadata.opf"), "<package><metadata/></package>").expect("запись OPF");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    let source = root.join("source.epub");
    fs::write(&source, "source").expect("запись источника");

    let index = crate::sources::index::LibraryIndex::from_external(
        &root,
        "library".to_string(),
        vec![crate::sources::models::ExternalBook {
            title: "Книга".to_string(),
            authors: vec!["Автор".to_string()],
            tags: Vec::new(),
            series: Vec::new(),
            files: vec![crate::sources::models::ExternalFile {
                kind: crate::sources::models::ExternalFileKind::Book,
                path: std::path::PathBuf::from("Автор/Книга (1)/book.epub"),
                format: "epub".to_string(),
            }],
        }],
    );
    let connection =
        crate::sources::catalog::build_catalog_from_index(&index).expect("каталог источника");
    let mut library = Library::open_for_selection(&root).expect("открытие внешней библиотеки");
    library
        .promote_external(connection, index, "library".to_string())
        .expect("публикация внешней библиотеки");

    let result = import_book(&mut library, &source);

    assert!(matches!(result, Err(ImportError::ReadOnly)));
    assert!(!root.join("books").exists());
    test_util::cleanup(&root);
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
}
