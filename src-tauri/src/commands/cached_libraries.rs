//! Команда перечисления сохранённых индексов библиотек.

use std::fs;
use std::path::Path;

use tauri::{command, AppHandle, Manager};

use serde::Serialize;

/// Сведения о сохранённой библиотеке.
#[derive(Debug, Serialize)]
pub struct CachedLibrary {
    /// Путь к библиотеке.
    pub path: String,
    /// Признак доступности директории.
    pub available: bool,
}

const CACHE_FILE: &str = "recent-libraries.json";

/// Получение сохранённых индексов и состояния исходных директорий.
#[command]
pub fn list_cached_libraries(app: AppHandle) -> Result<Vec<CachedLibrary>, String> {
    let file = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(CACHE_FILE);
    let mut paths: Vec<String> = match fs::read_to_string(file) {
        Ok(value) => serde_json::from_str(&value).unwrap_or_default(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error.to_string()),
    };
    paths.extend(legacy_cached_paths());
    paths.sort();
    paths.dedup();
    Ok(paths
        .into_iter()
        .map(|path| CachedLibrary {
            available: std::path::Path::new(&path).is_dir(),
            path,
        })
        .collect())
}

fn legacy_cached_paths() -> Vec<String> {
    let Some(directory) = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .map(|path| path.join(".booklib"))
    else {
        return Vec::new();
    };
    let Ok(entries) = fs::read_dir(directory) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                return None;
            }
            let value: serde_json::Value = serde_json::from_slice(&fs::read(path).ok()?).ok()?;
            value.get("root")?.as_str().map(str::to_string)
        })
        .collect()
}

/// Сохранение успешно открытой директории в app-local списке последних библиотек.
pub(crate) fn remember_library(app: &AppHandle, path: &str) -> Result<(), String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    let file = directory.join(CACHE_FILE);
    let mut paths: Vec<String> = match fs::read_to_string(&file) {
        Ok(value) => serde_json::from_str(&value).unwrap_or_default(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
        Err(error) => return Err(error.to_string()),
    };
    paths.retain(|current| current != path);
    paths.insert(0, path.to_string());
    paths.truncate(10);
    fs::write(
        file,
        serde_json::to_string(&paths).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}
