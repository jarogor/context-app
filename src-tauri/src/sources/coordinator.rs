//! Координатор опроса source-плагинов.

use std::path::Path;

use crate::plugin::{PluginError, PluginRuntime};

use super::models::ExternalBook;

/// Опрос загруженных source-плагинов для распознавания корня.
///
/// Возвращает имя первого плагина, подтвердившего поддержку корня, либо `None`
/// в отсутствие подходящего источника. Перед опросом песочный корень runtime
/// приводится к переданному корню, чтобы host-функции читали нужную директорию.
pub(crate) fn probe(
    runtime: &mut PluginRuntime,
    root: &Path,
) -> Result<Option<String>, PluginError> {
    if !root.exists() {
        return Ok(None);
    }
    runtime.set_sandbox_root(root.to_path_buf());
    for name in runtime.source_names() {
        if runtime.probe(&name)? {
            return Ok(Some(name));
        }
    }
    Ok(None)
}

/// Полное сканирование внешнего источника выбранным source-плагином.
pub(crate) fn scan(
    runtime: &mut PluginRuntime,
    root: &Path,
    source: &str,
) -> Result<Vec<ExternalBook>, PluginError> {
    runtime.set_sandbox_root(root.to_path_buf());
    runtime.scan(source)
}

/// Частичное пересканирование папки книги выбранным source-плагином.
pub(crate) fn scan_book(
    runtime: &mut PluginRuntime,
    root: &Path,
    source: &str,
    path: &str,
) -> Result<Option<ExternalBook>, PluginError> {
    runtime.set_sandbox_root(root.to_path_buf());
    runtime.scan_book(source, path)
}
