use super::*;
use crate::constants::{BOOKS_DIR_NAME, COVERS_DIR_NAME, PLUGINS_DIR_NAME};
use crate::test_util;

/// Получение временной директории для теста.
fn temp_library_root(name: &str) -> PathBuf {
    test_util::test_root(name)
}

fn remove_dir_contents(path: &Path) {
    test_util::cleanup(path);
}

#[test]
fn open_creates_portable_structure() {
    let root = temp_library_root("open-creates-structure");
    remove_dir_contents(&root);
    fs::create_dir_all(&root).expect("создание корня теста");

    let library = Library::open(&root).expect("открытие библиотеки");

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

    let library = Library::open(&root).expect("открытие существующей библиотеки");
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

    let result = Library::open(&not_a_dir);
    assert!(result.is_err(), "путь к файлу не является библиотекой");

    remove_dir_contents(&root);
}
