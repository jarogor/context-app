//! Постоянный кэш компиляции WASM-модулей плагинов.
//!
//! Готовит конфигурационный файл wasmtime, направляющий кэш JIT-компиляции в
//! область данных приложения. Путь к файлу передаётся в Extism при сборке
//! плагина, чтобы скомпилированные модули переживали перезапуск приложения и
//! не компилировались повторно.

use std::path::{Path, PathBuf};

use super::{get_bus, Severity};

/// Имя каталога кэша компиляции внутри области данных приложения.
pub const WASM_CACHE_DIR_NAME: &str = "wasm-cache";

/// Имя конфигурационного файла wasmtime.
///
/// Файл лежит рядом с каталогом кэша, а не внутри него: wasmtime при очистке
/// удаляет неопознанные файлы из каталога кэша и иначе стёр бы свою же
/// конфигурацию.
const CACHE_CONFIG_FILE_NAME: &str = "wasm-cache.toml";

/// Подготовка конфигурации постоянного кэша компиляции.
///
/// Создаёт каталог `<app_state_root>/wasm-cache` и конфигурационный файл
/// wasmtime `<app_state_root>/wasm-cache.toml` с абсолютным путём к нему. При
/// невозможности подготовить файл публикует диагностику и возвращает `None`:
/// загрузка плагинов продолжится без явного кэша, а не откажет.
pub(crate) fn prepare(app_state_root: &Path) -> Option<PathBuf> {
    match write_config(app_state_root) {
        Ok(path) => Some(path),
        Err(error) => {
            get_bus().publish_technical(
                Severity::Warn,
                format!("Постоянный кэш компиляции WASM недоступен: {error}"),
                "core",
                serde_json::json!({}),
            );
            None
        }
    }
}

/// Запись конфигурационного файла кэша и возврат пути к нему.
///
/// Путь к каталогу кэша абсолютизируется: wasmtime требует абсолютный
/// `directory` в конфигурации.
fn write_config(app_state_root: &Path) -> std::io::Result<PathBuf> {
    let cache_dir = app_state_root.join(WASM_CACHE_DIR_NAME);
    std::fs::create_dir_all(&cache_dir)?;
    let cache_dir = cache_dir.canonicalize()?;
    let config_path = app_state_root.join(CACHE_CONFIG_FILE_NAME);
    let contents = format!("[cache]\ndirectory = {}\n", toml_string(&cache_dir));
    std::fs::write(&config_path, contents)?;
    Ok(config_path)
}

/// Экранирование пути в TOML-строку.
fn toml_string(path: &Path) -> String {
    let mut escaped = String::with_capacity(path.as_os_str().len() + 2);
    escaped.push('"');
    for character in path.to_string_lossy().chars() {
        match character {
            '"' => escaped.push_str("\\\""),
            '\\' => escaped.push_str("\\\\"),
            other => escaped.push(other),
        }
    }
    escaped.push('"');
    escaped
}

#[cfg(test)]
#[path = "wasm_cache_tests.rs"]
mod tests;
