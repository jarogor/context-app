//! Атомарная запись и чтение файлов служебного состояния.
//!
//! Общий слой для реестров состояния (активность плагинов, история библиотек,
//! рабочие места) и host-функции служебного хранилища плагинов: запись идёт во
//! временный файл с последующим переименованием, чтение возвращает значение по
//! умолчанию при отсутствии файла.

use std::io;
use std::path::Path;

use serde::de::DeserializeOwned;
use serde::Serialize;

/// Атомарная запись байтов по пути с созданием родительского каталога.
pub fn atomic_write(path: &Path, contents: &[u8]) -> io::Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let temporary = path.with_extension("tmp");
    std::fs::write(&temporary, contents)?;
    std::fs::rename(&temporary, path)
}

/// Атомарная запись значения как JSON.
pub fn write_json<T: Serialize>(path: &Path, value: &T) -> io::Result<()> {
    let serialized = serde_json::to_string(value).map_err(io::Error::other)?;
    atomic_write(path, serialized.as_bytes())
}

/// Чтение JSON-значения из файла.
pub fn read_json<T: DeserializeOwned>(path: &Path) -> io::Result<T> {
    let value = std::fs::read_to_string(path)?;
    serde_json::from_str(&value).map_err(io::Error::other)
}

/// Чтение JSON-значения; отсутствующий файл даёт значение по умолчанию.
pub fn read_json_or_default<T: DeserializeOwned + Default>(path: &Path) -> io::Result<T> {
    match read_json(path) {
        Ok(value) => Ok(value),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(T::default()),
        Err(error) => Err(error),
    }
}

/// Чтение текста; отсутствующий или нечитаемый файл даёт пустую строку.
pub fn read_text_or_default(path: &Path) -> String {
    std::fs::read_to_string(path).unwrap_or_default()
}

#[cfg(test)]
#[path = "atomic_file_tests.rs"]
mod tests;
