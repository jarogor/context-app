//! Постоянный кэш компиляции WASM-модулей плагинов.
//!
//! Готовит конфигурационный файл wasmtime, направляющий кэш JIT-компиляции в
//! область данных приложения. Путь к файлу передаётся в Extism при сборке
//! плагина, чтобы скомпилированные модули переживали перезапуск приложения и
//! не компилировались повторно.
//!
//! Раскладка кэша задана wasmtime: `modules/<компилятор>/<хеш модуля>`. В
//! отладочной сборке в имя каталога компилятора входит время изменения
//! исполняемого файла, поэтому **каждая пересборка приложения создаёт новый
//! каталог**. Старые каталоги остаются с полным набором модулей — так кэш
//! разрастался до сотен мегабайт копий одного и того же.
//!
//! Поэтому очистка не считает «сколько места» или «сколько записей»: она
//! оставляет по одной копии каждого модуля (имя файла — хеш содержимого) в
//! самом свежем каталоге компилятора и удаляет остальные. Копии не нужны
//! никому: wasmtime читает модуль по хешу и берёт свежий каталог.

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
        Ok(path) => {
            let cache_dir = app_state_root.join(WASM_CACHE_DIR_NAME);
            prune(&cache_dir);
            Some(path)
        }
        Err(error) => {
            get_bus().publish(
                Severity::Warn,
                format!("Постоянный кэш компиляции WASM недоступен: {error}"),
                "core",
                serde_json::json!({}),
            );
            None
        }
    }
}

/// Удаление копий, оставшихся от прежних сборок приложения.
///
/// Вызывается и при старте, и после загрузки плагинов: за один запуск
/// компилируется тот же набор модулей, что и в прошлый, а каталог компилятора
/// уже другой. Без второго вызова копии копились бы всю сессию.
pub(crate) fn prune(cache_dir: &Path) {
    if let Err(error) = prune_inner(cache_dir) {
        get_bus().publish(
            Severity::Debug,
            format!("Очистка кэша компиляции WASM пропущена: {error}"),
            "core",
            serde_json::json!({}),
        );
    }
}

/// Очистка каталога кэша с возвратом ошибки ввода-вывода.
fn prune_inner(cache_dir: &Path) -> std::io::Result<()> {
    let modules_dir = cache_dir.join("modules");
    if !modules_dir.is_dir() {
        return Ok(());
    }
    let compiler_dirs = compiler_dirs(&modules_dir)?;
    // Свежий каталог — тот, в который писала текущая сборка: он последний по
    // времени изменения. В нём копии и остаются.
    let keep = compiler_dirs
        .iter()
        .max_by_key(|dir| dir.modified)
        .map(|dir| dir.path.clone());
    // Модули свежего каталога: по ним видно, какие копии в старых каталогах
    // уже не нужны.
    let fresh = match &keep {
        Some(path) => module_names(path),
        None => std::collections::HashSet::new(),
    };
    for dir in &compiler_dirs {
        if Some(&dir.path) == keep.as_ref() {
            continue;
        }
        // Старый каталог целиком состоит из копий: модули в нём те же, что в
        // свежем (имя — хеш содержимого), а другие модули там бесполезны, потому
        // что новый компилятор их всё равно не прочитает.
        let _ = std::fs::remove_dir_all(&dir.path);
    }
    // Файлы прямо в `modules` — старая раскладка: wasmtime читает модули
    // только из каталога компилятора, поэтому здесь они не нужны вовсе.
    for entry in std::fs::read_dir(&modules_dir)? {
        let entry = entry?;
        if entry.metadata()?.is_dir() {
            continue;
        }
        let path = entry.path();
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("stats"));
    }
    let _ = fresh;
    Ok(())
}

/// Каталог кэша одного компилятора: путь и время последней записи.
struct CompilerDir {
    /// Путь к каталогу.
    path: PathBuf,
    /// Время последнего изменения файла в нём.
    modified: std::time::SystemTime,
}

/// Каталоги компиляторов внутри `modules`.
fn compiler_dirs(modules_dir: &Path) -> std::io::Result<Vec<CompilerDir>> {
    let mut dirs = Vec::new();
    for entry in std::fs::read_dir(modules_dir)? {
        let entry = entry?;
        if !entry.metadata()?.is_dir() {
            continue;
        }
        let path = entry.path();
        dirs.push(CompilerDir {
            modified: newest_mtime(&path),
            path,
        });
    }
    Ok(dirs)
}

/// Время изменения самого свежего файла в каталоге.
fn newest_mtime(dir: &Path) -> std::time::SystemTime {
    let mut newest = std::time::UNIX_EPOCH;
    let Ok(entries) = std::fs::read_dir(dir) else {
        return newest;
    };
    for entry in entries.flatten() {
        if let Ok(metadata) = entry.metadata() {
            if let Ok(time) = metadata.modified() {
                newest = newest.max(time);
            }
        }
    }
    newest
}

/// Имена модулей в каталоге, без файлов статистики.
fn module_names(dir: &Path) -> std::collections::HashSet<String> {
    let mut names = std::collections::HashSet::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return names;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) == Some("stats") {
            continue;
        }
        if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
            names.insert(name.to_string());
        }
    }
    names
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
