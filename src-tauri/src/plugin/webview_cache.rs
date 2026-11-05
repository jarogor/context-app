//! Очистка устаревших данных движка webview.
//!
//! WebView хранит в своём каталоге кэш ответов, ресурсов и blob'ов
//! (`WebKitCache`, `Cache`, `NetworkCache`). Эти данные — не состояние
//! приложения: они лишь ускоряют повторную загрузку, и их потеря ничего не
//! ломает. Но растут они без предела, поэтому старые записи удаляются.
//!
//! Критерий — **возраст**, а не размер. Размер ничего не говорит о пользе:
//! старый кэш занимает место и уже не переиспользуется, а свежий может быть
//! нужен следующему запуску. Поэтому удаляются только записи старше
//! [`MAX_AGE_DAYS`], и только из известных кэшевых каталогов: localStorage,
//! cookies и прочее состояние так не трогаются.

use std::path::Path;
use std::time::{Duration, SystemTime};

use super::{get_bus, Severity};

/// Возраст, после которого запись кэша webview считается устаревшей.
///
/// Неделя — срок, за который ресурс интерфейса заведомо перезагружается, а
/// пользователь не заметит повторной загрузки. Меньше брать незачем: выигрыш
/// по месту мизерный, а кэш перестаёт экономить работу.
const MAX_AGE_DAYS: u64 = 7;

/// Имена каталогов, которые являются кэшем, а не состоянием.
///
/// Список намеренно короткий: сюда попадает только то, чью потерю движок
/// переживает молча. `localstorage`, `storage`, `cookies`, `mediakeys` и
/// подобное не входят — это данные приложения и пользователя.
const CACHE_DIR_NAMES: &[&str] = &[
    "WebKitCache",
    "Cache",
    "CacheStorage",
    "NetworkCache",
    "CodeCache",
    "GPUCache",
    "blob_storage",
];

/// Удаление устаревших записей кэша webview.
///
/// Вызывается при старте: кэш не нужен немедленно, а неудачная очистка не
/// должна мешать запуску — ошибка публикуется как отладочная и работа идёт
/// дальше.
pub(crate) fn prune(webview_root: &Path) {
    if let Err(error) = prune_inner(webview_root, SystemTime::now()) {
        get_bus().publish(
            Severity::Debug,
            format!("Очистка кэша webview пропущена: {error}"),
            "core",
            serde_json::json!({}),
        );
    }
}

/// Очистка с явным «текущим» временем — чтобы поведение проверялось тестом.
fn prune_inner(webview_root: &Path, now: SystemTime) -> std::io::Result<()> {
    if !webview_root.is_dir() {
        return Ok(());
    }
    let Some(threshold) = now.checked_sub(Duration::from_secs(MAX_AGE_DAYS * 86_400)) else {
        return Ok(());
    };
    for entry in std::fs::read_dir(webview_root)? {
        let entry = entry?;
        if !entry.metadata()?.is_dir() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().into_owned();
        if !CACHE_DIR_NAMES.iter().any(|known| name == *known) {
            continue;
        }
        // Внутри кэша записи лежат деревом; старые ветки удаляются целиком,
        // свежие не трогаются.
        remove_older_than(&entry.path(), threshold)?;
    }
    Ok(())
}

/// Удаление файлов и каталогов, изменённых раньше порога.
///
/// Каталог удаляется целиком, только если все его файлы старше порога: иначе
/// внутри есть свежие записи, и он нужен.
fn remove_older_than(dir: &Path, threshold: SystemTime) -> std::io::Result<()> {
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return Ok(()),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata.is_dir() {
            remove_older_than(&path, threshold)?;
            // Пустой после очистки каталог тоже убирается: он ничего не хранит.
            let empty = std::fs::read_dir(&path)
                .map(|mut items| items.next().is_none())
                .unwrap_or(false);
            if empty {
                let _ = std::fs::remove_dir(&path);
            }
            continue;
        }
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);
        if modified < threshold {
            let _ = std::fs::remove_file(&path);
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "webview_cache_tests.rs"]
mod tests;
