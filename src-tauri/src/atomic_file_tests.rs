//! Тесты слоя атомарной записи и чтения файлов состояния.

use serde::{Deserialize, Serialize};

use super::{atomic_write, read_json, read_json_or_default, read_text_or_default, write_json};

/// Значение для проверок сериализации.
#[derive(Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
struct Sample {
    /// Числовое поле.
    value: u32,
    /// Строковое поле.
    name: String,
}

/// Запись и чтение значения JSON сохраняют данные.
#[test]
fn writes_and_reads_json() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("sample.json");
    let sample = Sample {
        value: 7,
        name: "проба".to_string(),
    };

    write_json(&path, &sample).expect("запись");

    let loaded: Sample = read_json(&path).expect("чтение");
    assert_eq!(loaded, sample);
}

/// Запись создаёт отсутствующий родительский каталог.
#[test]
fn creates_parent_directory() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("nested").join("sample.json");

    write_json(&path, &Sample::default()).expect("запись");

    assert!(path.is_file());
}

/// Отсутствующий файл даёт значение по умолчанию.
#[test]
fn missing_file_gives_default() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("absent.json");

    let loaded: Sample = read_json_or_default(&path).expect("значение по умолчанию");

    assert_eq!(loaded, Sample::default());
}

/// Отсутствующий текстовый файл даёт пустую строку.
#[test]
fn missing_text_gives_empty() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("absent.txt");

    assert_eq!(read_text_or_default(&path), "");
}

/// Атомарная запись не оставляет временный файл.
#[test]
fn atomic_write_leaves_no_temporary() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("sample.json");

    atomic_write(&path, b"{}").expect("запись");

    assert!(path.is_file());
    assert!(!path.with_extension("tmp").exists());
}
