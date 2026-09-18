use super::*;
use crate::constants::{bundled_plugins_dir, BOOKS_DIR_NAME, COVERS_DIR_NAME, PLUGINS_DIR_NAME};
use crate::sources::catalog::build_catalog_from_index;
use crate::sources::index::{index_path, LibraryIndex};
use crate::sources::models::{ExternalBook, ExternalFile, ExternalFileKind};
use crate::test_util;

/// Получение временной директории для теста.
fn temp_library_root(name: &str) -> PathBuf {
    test_util::test_root(name)
}

fn remove_dir_contents(path: &Path) {
    test_util::cleanup(path);
}

fn prepare_selected(
    root: &PathBuf,
) -> Result<(bool, Connection, Option<LibraryIndex>, Option<String>), LibraryError> {
    Library::prepare_selected(&root, bundled_plugins_dir())
}

fn open_for_selection(root: &PathBuf) -> Result<Library, LibraryError> {
    Library::open_for_selection(&root, bundled_plugins_dir())
}

fn open(root: &PathBuf) -> Result<Library, LibraryError> {
    Library::open(&root, bundled_plugins_dir())
}

/// Признак наличия поставляемого source-плагина библиотеки.
///
/// Тесты распознавания внешней библиотеки опираются на реальный плагин из
/// `resources/plugins/library` и выполняются только после его сборки.
fn library_plugin_available() -> bool {
    bundled_plugins_dir()
        .join(crate::constants::LIBRARY_PLUGIN_DIR)
        .is_dir()
}

/// Книга внешней библиотеки с файлом содержимого и обложкой.
fn external_book1() -> ExternalBook {
    ExternalBook {
        title: "Книга".to_string(),
        authors: vec!["Автор".to_string()],
        tags: Vec::new(),
        series: Vec::new(),
        files: vec![
            ExternalFile {
                kind: ExternalFileKind::Book,
                path: PathBuf::from("Автор/Книга (7)/book.epub"),
                format: "epub".to_string(),
            },
            ExternalFile {
                kind: ExternalFileKind::Cover,
                path: PathBuf::from("Автор/Книга (7)/cover.jpg"),
                format: "jpg".to_string(),
            },
        ],
    }
}

#[test]
fn open_creates_portable_structure() {
    let root = temp_library_root("open-creates-structure");
    remove_dir_contents(&root);
    fs::create_dir_all(&root).expect("создание корня теста");

    let library = open(&root).expect("открытие библиотеки");

    assert!(root.join(DATABASE_FILE_NAME).exists(), "файл БД создан");
    assert!(root.join(BOOKS_DIR_NAME).is_dir(), "папка books создана");
    assert!(root.join(COVERS_DIR_NAME).is_dir(), "папка covers создана");
    assert!(
        root.join(PLUGINS_DIR_NAME).is_dir(),
        "папка plugins создана"
    );
    assert_eq!(library.books_dir(), BOOKS_DIR_NAME);
    assert_eq!(library.covers_dir(), COVERS_DIR_NAME);
    assert_eq!(library.plugins_dir(), PLUGINS_DIR_NAME);
    assert_eq!(library.mode(), LibraryMode::Portable);

    remove_dir_contents(&root);
}

#[test]
fn open_existing_library_keeps_structure() {
    let root = temp_library_root("open-existing");
    remove_dir_contents(&root);
    fs::create_dir_all(&root).expect("создание корня теста");
    fs::create_dir_all(root.join("books")).expect("создание books");
    fs::create_dir_all(root.join("covers")).expect("создание covers");
    fs::create_dir_all(root.join("plugins")).expect("создание plugins");
    Connection::open(root.join(DATABASE_FILE_NAME)).expect("создание БД");

    let library = open(&root).expect("открытие существующей библиотеки");
    assert!(
        root.join(DATABASE_FILE_NAME).exists(),
        "БД осталась на месте"
    );
    assert_eq!(library.root(), &root);

    remove_dir_contents(&root);
}

#[test]
fn open_path_is_a_file_reports_error() {
    let root = temp_library_root("open-file-not-dir");
    remove_dir_contents(&root);
    fs::create_dir_all(&root).expect("создание корня теста");
    let not_a_dir = root.join("plain-file.txt");
    fs::write(&not_a_dir, "not a dir").expect("запись файла");

    let result = Library::open(&not_a_dir, bundled_plugins_dir());
    assert!(result.is_err(), "путь к файлу не является библиотекой");

    remove_dir_contents(&root);
}

#[test]
fn external_state_does_not_write_to_library() {
    let root = temp_library_root("external-read-only");
    remove_dir_contents(&root);
    let book = root.join("Автор").join("Книга (7)");
    fs::create_dir_all(&book).expect("создание папки внешней книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");

    let index = LibraryIndex::from_external(&root, "library".to_string(), vec![external_book1()]);
    let connection = build_catalog_from_index(&index).expect("каталог внешнего источника");
    let mut library = open_for_selection(&root).expect("состояние перед индексацией");
    library
        .promote_external(connection, index, "library".to_string())
        .expect("публикация внешней библиотеки");

    assert_eq!(library.mode(), LibraryMode::External);
    assert_eq!(library.source_name(), Some("library"));
    assert!(!root.join(DATABASE_FILE_NAME).exists(), "БД не создаётся");
    assert!(!root.join(BOOKS_DIR_NAME).exists(), "books не создаётся");
    let books = crate::catalog::repository::list_books(library.connection()).unwrap();
    assert_eq!(books.len(), 1);
    let cover = books[0]
        .files
        .iter()
        .find(|file| file.kind == crate::catalog::FileKind::Cover)
        .expect("обложка внешней книги");
    assert_eq!(cover.path, "Автор/Книга (7)/cover.jpg");
    assert_eq!(fs::read(root.join(&cover.path)).unwrap(), b"cover");

    remove_dir_contents(&root);
}

#[test]
fn open_external_library_without_writing_to_it() {
    if !library_plugin_available() {
        return;
    }
    let root = temp_library_root("open-library");
    remove_dir_contents(&root);
    let book = root.join("Автор").join("Книга (7)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");

    let library = open(&root).expect("открытие внешней библиотеки");

    assert_eq!(library.mode(), LibraryMode::External);
    assert!(library.source_name().is_some(), "источник определён");
    assert!(!root.join(DATABASE_FILE_NAME).exists());
    assert!(!root.join(BOOKS_DIR_NAME).exists());
    let books = crate::catalog::repository::list_books(library.connection()).unwrap();
    assert_eq!(books.len(), 1);
    let cover = books[0]
        .files
        .iter()
        .find(|file| file.kind == crate::catalog::FileKind::Cover)
        .expect("обложка книги");
    assert_eq!(cover.path, "Автор/Книга (7)/cover.jpg");
    assert_eq!(fs::read(root.join(&cover.path)).unwrap(), b"cover");

    remove_dir_contents(&root);
}

#[test]
fn prepare_selected_detects_external_library() {
    if !library_plugin_available() {
        return;
    }
    let root = temp_library_root(&format!("prepare-selected-{}", std::process::id()));
    remove_dir_contents(&root);
    let path = index_path(&root);
    let _ = fs::remove_file(&path);
    let _ = fs::remove_file(path.with_extension("db"));
    let book = root.join("Автор").join("Книга (7)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");
    fs::write(book.join("cover.jpg"), "cover").expect("запись обложки");

    let (is_external, connection, index, source) =
        prepare_selected(&root).expect("подготовка выбранной директории");

    assert!(is_external, "директория распознана как внешняя");
    assert_eq!(source.as_deref(), Some("library"));
    assert!(index.is_some(), "индекс создан");
    let books = crate::catalog::repository::list_books(&connection).unwrap();
    assert_eq!(books.len(), 1);
    assert_eq!(books[0].title, "Книга (7)");

    remove_dir_contents(&root);
}

#[test]
fn prepare_selected_reuses_cached_index() {
    if !library_plugin_available() {
        return;
    }
    let root = temp_library_root(&format!("prepare-selected-cached-{}", std::process::id()));
    remove_dir_contents(&root);
    let path = index_path(&root);
    let _ = fs::remove_file(&path);
    let _ = fs::remove_file(path.with_extension("db"));
    let book = root.join("Автор").join("Книга (8)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");

    let first = prepare_selected(&root).expect("первая подготовка");
    let second = prepare_selected(&root).expect("вторая подготовка");

    assert_eq!(first.0, second.0, "неизменная библиотека осталась внешней");
    assert_eq!(
        second.2.as_ref().map(|index| index.external_books().len()),
        Some(1),
        "второе открытие переиспользовало индекс"
    );

    remove_dir_contents(&root);
}

#[test]
fn affected_directories_ignore_root_and_hidden_paths() {
    let root = PathBuf::from("/library");
    let paths = vec![
        root.join("readme.txt"),
        root.join(".booklib").join("index.json"),
        root.join("Автор").join("Книга (1)").join("book.epub"),
    ];

    let affected = affected_book_directories(&root, &paths);

    assert_eq!(affected.len(), 1);
    assert!(affected.contains(&root.join("Автор").join("Книга (1)")));
}

#[test]
fn startup_does_not_fire_index_update_notifications() {
    use crate::journal::get_journal_handle;
    use std::time::Duration;

    let root = temp_library_root(&format!("startup-no-flood-{}", std::process::id()));
    remove_dir_contents(&root);
    let _ = fs::remove_file(index_path(&root));
    for id in 0..4 {
        let book = root.join("Автор").join(format!("Книга ({id})"));
        fs::create_dir_all(&book).expect("создание папки книги");
        fs::write(book.join("book.epub"), "epub").expect("запись книги");
    }
    let books = (0..4)
        .map(|id| ExternalBook {
            title: "Книга".to_string(),
            authors: vec!["Автор".to_string()],
            tags: Vec::new(),
            series: Vec::new(),
            files: vec![ExternalFile {
                kind: ExternalFileKind::Book,
                path: PathBuf::from(format!("Автор/Книга ({id})/book.epub")),
                format: "epub".to_string(),
            }],
        })
        .collect::<Vec<_>>();

    let index = LibraryIndex::from_external(&root, "library".to_string(), books);
    let connection = build_catalog_from_index(&index).expect("каталог внешнего источника");
    get_journal_handle().clear();
    let mut library = open_for_selection(&root).expect("проинициализировать состояние");
    library
        .promote_external(connection, index, "library".to_string())
        .expect("перевод в боевое состояние");

    std::thread::sleep(Duration::from_millis(150));
    for _ in 0..40 {
        library
            .sync_if_needed()
            .expect("синхронизация без реальных изменений");
    }

    let entries = get_journal_handle().all(None);
    let updates: usize = entries
        .iter()
        .filter(|entry| {
            entry.message == "Индекс библиотеки обновлён"
                && entry.source == root.display().to_string()
        })
        .count();
    assert_eq!(
        updates, 0,
        "при неизменной библиотеке не должно быть уведомлений об обновлении индекса: {:?}",
        entries
    );

    remove_dir_contents(&root);
}

#[test]
fn directory_without_external_markers_stays_portable() {
    let root = temp_library_root("open-not-external");
    remove_dir_contents(&root);
    fs::create_dir_all(root.join("Author").join("Book (1)")).expect("создание каталогов");

    let library = open(&root).expect("открытие собственной библиотеки");

    assert_eq!(library.mode(), LibraryMode::Portable);
    assert!(root.join(DATABASE_FILE_NAME).exists());

    remove_dir_contents(&root);
}

#[test]
fn reopens_library_from_index_and_updates_renamed_book() {
    if !library_plugin_available() {
        return;
    }
    let root = temp_library_root(&format!("open-library-indexed-{}", std::process::id()));
    remove_dir_contents(&root);
    let _ = fs::remove_file(index_path(&root));
    let book = root.join("Автор").join("Книга (21)");
    fs::create_dir_all(&book).expect("создание папки книги");
    fs::write(book.join("book.epub"), "epub").expect("запись книги");

    let first = open(&root).expect("первое открытие");
    let first_books =
        crate::catalog::repository::list_books(first.connection()).expect("первый список");
    assert_eq!(first_books[0].title, "Книга (21)");
    drop(first);

    let new_book = root.join("Автор").join("Книга (22)");
    let mut second = open(&root).expect("повторное открытие");
    fs::rename(&book, &new_book).expect("переименование папки книги");
    std::thread::sleep(std::time::Duration::from_millis(100));
    second
        .sync_if_needed()
        .expect("синхронизация после повторного открытия");
    let second_books =
        crate::catalog::repository::list_books(second.connection()).expect("второй список");
    assert_eq!(second_books[0].title, "Книга (22)");

    remove_dir_contents(&root);
}
