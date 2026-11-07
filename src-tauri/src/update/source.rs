//! Чтение индекса и загрузка артефактов из файлового или сетевого источника.
//!
//! Источник обновлений задаётся каталогом (`file`) или базовым адресом
//! (`network`). В обоих случаях индекс называется `update-index.json`, а пути
//! артефактов в нём относительны источнику. Для сетевого источника допускается
//! только HTTPS; HTTP разрешён лишь для локальной разработки.

use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::Duration;

use crate::plugin::plugin_manifest::is_safe_relative_path;

use super::models::{UpdateIndex, UpdateSource};
use super::{MAX_INDEX_BYTES, NETWORK_TIMEOUT_SECS};

/// Имя файла индекса обновлений в источнике.
pub const INDEX_FILE_NAME: &str = "update-index.json";

/// Поддерживаемая версия контракта индекса обновлений.
const INDEX_CONTRACT_VERSION: u32 = 1;

/// Чтение индекса обновлений из источника.
pub fn read_index(source: &UpdateSource) -> Result<UpdateIndex, String> {
    source.validate()?;
    let text = read_text(source, INDEX_FILE_NAME, MAX_INDEX_BYTES)?;
    let value: serde_json::Value = serde_json::from_str(&text)
        .map_err(|error| format!("некорректный индекс обновлений: {error}"))?;
    crate::documents::schema::validate_text(
        &value,
        crate::documents::UPDATE_INDEX.current_schema(),
        "update-index",
    )?;
    let index: UpdateIndex = serde_json::from_value(value)
        .map_err(|error| format!("некорректный индекс обновлений: {error}"))?;
    if index.contract_version != INDEX_CONTRACT_VERSION {
        return Err(format!(
            "неподдерживаемая версия индекса обновлений: {}",
            index.contract_version
        ));
    }
    Ok(index)
}

/// Чтение текстового файла источника с ограничением размера.
pub fn read_text(
    source: &UpdateSource,
    relative: &str,
    max_bytes: usize,
) -> Result<String, String> {
    let bytes = read_bytes(source, relative, max_bytes)?;
    String::from_utf8(bytes).map_err(|_| "файл источника не является UTF-8".to_string())
}

/// Чтение байтов файла источника с ограничением размера.
pub fn read_bytes(
    source: &UpdateSource,
    relative: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, String> {
    match source.kind.as_str() {
        "file" => {
            let path = resolve_file(&source.location, relative)?;
            let bytes =
                fs::read(&path).map_err(|error| format!("файл источника не читается: {error}"))?;
            if bytes.len() > max_bytes {
                return Err("файл источника превышает допустимый размер".to_string());
            }
            Ok(bytes)
        }
        "network" => {
            let url = resolve_url(&source.location, relative)?;
            let mut response = agent()
                .get(&url)
                .call()
                .map_err(|error| format!("источник обновлений недоступен: {error}"))?;
            let mut bytes = Vec::new();
            response
                .body_mut()
                .as_reader()
                .take(max_bytes as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|error| format!("источник обновлений не прочитан: {error}"))?;
            if bytes.len() > max_bytes {
                return Err("ответ источника превышает допустимый размер".to_string());
            }
            Ok(bytes)
        }
        other => Err(format!("неизвестный вид источника обновлений: {other}")),
    }
}

/// Загрузка артефакта источника в указанный файл.
pub fn download(
    source: &UpdateSource,
    relative: &str,
    destination: &Path,
    max_bytes: u64,
) -> Result<(), String> {
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("каталог загрузки недоступен: {error}"))?;
    }
    match source.kind.as_str() {
        "file" => {
            let path = resolve_file(&source.location, relative)?;
            let size = fs::metadata(&path)
                .map_err(|error| format!("файл источника недоступен: {error}"))?
                .len();
            if size > max_bytes {
                return Err("артефакт превышает допустимый размер".to_string());
            }
            fs::copy(&path, destination)
                .map_err(|error| format!("артефакт не скопирован: {error}"))?;
            Ok(())
        }
        "network" => {
            let url = resolve_url(&source.location, relative)?;
            let mut response = agent()
                .get(&url)
                .call()
                .map_err(|error| format!("артефакт недоступен: {error}"))?;
            if let Some(length) = response.body().content_length() {
                if length > max_bytes {
                    return Err("артефакт превышает допустимый размер".to_string());
                }
            }
            let mut file = fs::File::create(destination)
                .map_err(|error| format!("файл загрузки не создан: {error}"))?;
            let copied = std::io::copy(
                &mut response.body_mut().as_reader().take(max_bytes + 1),
                &mut file,
            )
            .map_err(|error| format!("артефакт не загружен: {error}"))?;
            if copied > max_bytes {
                let _ = fs::remove_file(destination);
                return Err("артефакт превышает допустимый размер".to_string());
            }
            Ok(())
        }
        other => Err(format!("неизвестный вид источника обновлений: {other}")),
    }
}

/// Человекочитаемое описание источника для журнала и интерфейса.
pub fn describe(source: &UpdateSource) -> String {
    match source.kind.as_str() {
        "file" => format!("каталог {}", source.location),
        "network" => format!("адрес {}", source.location),
        other => format!("{other}: {}", source.location),
    }
}

/// Разрешение относительного пути внутри файлового источника.
fn resolve_file(base: &str, relative: &str) -> Result<PathBuf, String> {
    let base = Path::new(base);
    let relative_path = Path::new(relative);
    if relative_path.is_absolute() {
        return Ok(relative_path.to_path_buf());
    }
    if !is_safe_relative_path(relative) {
        return Err(format!("некорректный путь в источнике: {relative}"));
    }
    Ok(base.join(relative_path))
}

/// Разрешение адреса артефакта в сетевом источнике.
fn resolve_url(base: &str, relative: &str) -> Result<String, String> {
    if relative.starts_with("https://") || relative.starts_with("http://") {
        return validate_url(relative);
    }
    if !is_safe_relative_path(relative) {
        return Err(format!("некорректный путь в источнике: {relative}"));
    }
    let joined = format!(
        "{}/{}",
        base.trim_end_matches('/'),
        relative.trim_start_matches('/')
    );
    validate_url(&joined)
}

/// Проверка транспорта сетевого источника.
fn validate_url(url: &str) -> Result<String, String> {
    if url.starts_with("https://") {
        return Ok(url.to_string());
    }
    let local = url.starts_with("http://127.0.0.1/")
        || url.starts_with("http://127.0.0.1:")
        || url.starts_with("http://localhost/")
        || url.starts_with("http://localhost:")
        || url.starts_with("http://[::1]/")
        || url.starts_with("http://[::1]:");
    if url.starts_with("http://") && local {
        return Ok(url.to_string());
    }
    Err("сетевой источник обновлений должен использовать HTTPS".to_string())
}

/// HTTP-агент с общим таймаутом запросов.
fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(NETWORK_TIMEOUT_SECS)))
        .build()
        .into()
}

#[cfg(test)]
#[path = "source_tests.rs"]
mod tests;
