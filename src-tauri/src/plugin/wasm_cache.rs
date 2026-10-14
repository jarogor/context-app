//! Постоянный кэш компиляции WASM-модулей плагинов.
//!
//! Готовит конфигурационный файл wasmtime, направляющий кэш JIT-компиляции в
//! область данных приложения. Путь к файлу передаётся в Extism при сборке
//! плагина, чтобы скомпилированные модули переживали перезапуск приложения и
//! не компилировались повторно.
//!
//! Каталог кэша ограничивается по размеру и по числу записей: wasmtime удаляет
//! часть записей при переполнении, но накопление всё равно нужно ограничивать
//! явно, иначе кэш растёт после каждой пересборки плагинов. Устаревшие записи
//! удаляются, а записи активного набора модулей не трогаются.

use std::path::{Path, PathBuf};

use super::{get_bus, Severity};

/// Имя каталога кэша компиляции внутри области данных приложения.
pub const WASM_CACHE_DIR_NAME: &str = "wasm-cache";

/// Наибольший допустимый размер каталога модулей кэша в байтах (256 МиБ).
pub const WASM_CACHE_MAX_BYTES: u64 = 256 * 1024 * 1024;

/// Наибольшее допустимое число модулей в кэше (по 4 на плагин с запасом).
pub const WASM_CACHE_MAX_ENTRIES: usize = 64;

/// Имя конфигурационного файла wasmtime.
///
/// Файл лежит рядом с каталогом кэша, а не внутри него: wasmtime при очистке
/// удаляет неопознанные файлы из каталога кэша и иначе стёр бы свою же
/// конфигурацию.
const CACHE_CONFIG_FILE_NAME: &str = "wasm-cache.toml";

/// Подготовка конфигурации постоянного кэша компиляции.
///
/// Создаёт каталог `<app_state_root>/wasm-cache` и конфигурационный файл
/// wasmtime `<app_state_root>/wasm-cache.toml` с абсолютным путём к нему. Перед
/// возвратом ограничивает размер кэша (см. [`cleanup`]). При невозможности
/// подготовить файл публикует диагностику и возвращает `None`: загрузка
/// плагинов продолжится без явного кэша, а не откажет.
pub(crate) fn prepare(app_state_root: &Path) -> Option<PathBuf> {
    match write_config(app_state_root) {
        Ok(path) => {
            let cache_dir = app_state_root.join(WASM_CACHE_DIR_NAME);
            cleanup(&cache_dir);
            Some(path)
        }
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

/// Ограничение кэша компиляции по размеру и числу записей.
///
/// Удаляет старейшие записи (модули и их `.stats`), пока каталог не уложится в
/// [`WASM_CACHE_MAX_BYTES`] и [`WASM_CACHE_MAX_ENTRIES`]. Записи, используемые
/// текущими модулями, определяются как самые свежие по времени изменения и не
/// удаляются, пока не превышен предел. Сбой очистки публикуется как диагностика
/// и не прерывает запуск.
pub(crate) fn cleanup(cache_dir: &Path) {
    if let Err(error) = cleanup_inner(cache_dir) {
        get_bus().publish_technical(
            Severity::Debug,
            format!("Очистка кэша компиляции WASM пропущена: {error}"),
            "core",
            serde_json::json!({}),
        );
    }
}

/// Очистка каталога кэша с возвратом ошибки ввода-вывода.
fn cleanup_inner(cache_dir: &Path) -> std::io::Result<()> {
    let modules_dir = cache_dir.join("modules");
    if !modules_dir.is_dir() {
        return Ok(());
    }

    // Записи собираются парами «модуль + .stats» по времени изменения: свежие
    // остаются, старейшие удаляются. Свежие — это те, что собраны текущей
    // сборкой приложения, поэтому их удаление остановилось бы на перекомпиляции.
    let mut entries = cache_entries(&modules_dir)?;
    let mut total_bytes: u64 = entries.iter().map(|entry| entry.size).sum();
    let mut total_count = entries.len();

    entries.sort_by_key(|entry| entry.modified);
    for entry in entries {
        if total_bytes <= WASM_CACHE_MAX_BYTES && total_count <= WASM_CACHE_MAX_ENTRIES {
            break;
        }
        remove_cache_entry(&entry);
        total_bytes = total_bytes.saturating_sub(entry.size);
        total_count = total_count.saturating_sub(1);
    }
    Ok(())
}

/// Запись кэша: путь, размер и время изменения.
struct CacheEntry {
    /// Путь к файлу записи.
    path: PathBuf,
    /// Размер файла в байтах.
    size: u64,
    /// Время последнего изменения для упорядочивания.
    modified: std::time::SystemTime,
}

/// Перечисление файлов-модулей кэша (без `.stats`).
fn cache_entries(modules_dir: &Path) -> std::io::Result<Vec<CacheEntry>> {
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(modules_dir)? {
        let entry = entry?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        if path.extension().and_then(|value| value.to_str()) == Some("stats") {
            continue;
        }
        let metadata = entry.metadata()?;
        let modified = metadata.modified().unwrap_or(std::time::UNIX_EPOCH);
        entries.push(CacheEntry {
            path,
            size: metadata.len(),
            modified,
        });
    }
    Ok(entries)
}

/// Удаление записи кэша вместе с её файлом статистики.
///
/// Устаревшие каталоги подмодулей wasmtime не сохраняются: каждый запуск создаёт
/// новый каталог, поэтому старые каталоги без модулей удаляются целиком.
fn remove_cache_entry(entry: &CacheEntry) {
    let _ = std::fs::remove_file(&entry.path);
    let stats = entry.path.with_extension("stats");
    let _ = std::fs::remove_file(stats);
    if let Some(parent) = entry.path.parent() {
        // Каталог пуст, если в нём не осталось записей: after wasmtime создаёт
        // каталог на запуск, поэтому пустой каталог — устаревший.
        let _ = std::fs::remove_dir(parent);
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
