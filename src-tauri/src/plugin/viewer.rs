//! Файлы модуля рисования плагина рабочего места.
//!
//! Модуль рисования состоит из одного или нескольких статических файлов
//! каталога плагина. Ядро безопасно перечисляет и читает их, не выходя за
//! каталог, и не интерпретирует содержимое: приложение помещает файлы в
//! песочницу как непрозрачные адреса.

use std::path::Path;

use serde::Serialize;

use crate::plugin::plugin_manifest::is_safe_relative_path;
use crate::plugin::PluginError;

/// Описание файла модуля рисования для приложения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ViewerFile {
    /// Относительный путь файла внутри каталога модуля (разделитель `/`).
    pub path: String,
    /// MIME-тип по расширению файла.
    pub mime: String,
}

/// Перечисление файлов модуля рисования в каталоге плагина.
///
/// Обход рекурсивный; пути возвращаются относительными и с разделителем `/`.
/// Файлы, для которых не удаётся построить безопасный относительный путь,
/// пропускаются.
pub fn list_files(dir: &Path) -> Result<Vec<ViewerFile>, PluginError> {
    let mut files = Vec::new();
    collect(dir, dir, &mut files)?;
    files.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(files)
}

/// Чтение файла модуля рисования по относительному пути.
///
/// Путь должен быть безопасным (относительным, без выхода за каталог); иначе
/// возвращается ошибка, а ничего вне каталога не читается.
pub fn read_file(dir: &Path, relative: &str) -> Result<Vec<u8>, PluginError> {
    if !is_safe_relative_path(relative) {
        return Err(PluginError::ViewerResource {
            plugin: dir.display().to_string(),
            message: format!("небезопасный путь файла модуля: {relative}"),
        });
    }
    let path = dir.join(relative);
    let root = dir
        .canonicalize()
        .map_err(|error| PluginError::ViewerResource {
            plugin: dir.display().to_string(),
            message: error.to_string(),
        })?;
    let resolved = path
        .canonicalize()
        .map_err(|error| PluginError::ViewerResource {
            plugin: dir.display().to_string(),
            message: error.to_string(),
        })?;
    if !resolved.starts_with(&root) {
        return Err(PluginError::ViewerResource {
            plugin: dir.display().to_string(),
            message: format!("файл модуля вне каталога плагина: {relative}"),
        });
    }
    std::fs::read(&resolved).map_err(|error| PluginError::ViewerResource {
        plugin: dir.display().to_string(),
        message: error.to_string(),
    })
}

/// MIME-тип по расширению имени файла.
pub fn mime_for(path: &str) -> String {
    let extension = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let value = match extension.as_str() {
        "html" | "htm" => "text/html",
        "mjs" | "js" => "text/javascript",
        "css" => "text/css",
        "json" => "application/json",
        "wasm" => "application/wasm",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "bcmap" => "application/octet-stream",
        _ => "application/octet-stream",
    };
    value.to_string()
}

/// Рекурсивный обход каталога с накоплением файлов модуля.
fn collect(root: &Path, dir: &Path, files: &mut Vec<ViewerFile>) -> Result<(), PluginError> {
    let entries = std::fs::read_dir(dir).map_err(|error| PluginError::ViewerResource {
        plugin: root.display().to_string(),
        message: error.to_string(),
    })?;
    for entry in entries.flatten() {
        let path = entry.path();
        let file_type = match entry.file_type() {
            Ok(value) => value,
            Err(_) => continue,
        };
        if file_type.is_dir() {
            collect(root, &path, files)?;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        let Ok(relative) = path.strip_prefix(root) else {
            continue;
        };
        let Some(relative) = relative_path_string(relative) else {
            continue;
        };
        let mime = mime_for(&relative);
        files.push(ViewerFile {
            path: relative,
            mime,
        });
    }
    Ok(())
}

/// Относительный путь с разделителем `/` либо `None`, если он небезопасен.
fn relative_path_string(path: &Path) -> Option<String> {
    let mut parts: Vec<String> = Vec::new();
    for component in path.components() {
        match component {
            std::path::Component::Normal(value) => parts.push(value.to_string_lossy().to_string()),
            _ => return None,
        }
    }
    if parts.is_empty() {
        return None;
    }
    Some(parts.join("/"))
}

#[cfg(test)]
#[path = "viewer_tests.rs"]
mod tests;
