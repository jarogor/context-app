//! WASM-точка входа плагина.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! host-функции приложения и экспортируемую функцию `invoke` по контракту.

use crate::fs::Fs;
use crate::lifecycle;
use crate::models::{SourceCapabilities, SourceCatalog, SOURCE_PROTOCOL_VERSION};
use crate::scanner;
use extism_pdk::{plugin_fn, FnResult};
use serde_json::json;
use source_common::host::{emit_notification, HostFs};
use source_common::labels::{indexed_message, library_label};
use source_common::request::Request;
use std::rc::Rc;

/// Ответ операции открытия source-сессии.
#[derive(serde::Serialize)]
struct OpenResponse {
    /// Идентификатор source-сессии.
    session_id: String,
    /// Согласованный snapshot каталога.
    catalog: SourceCatalog,
}

/// Точка расширения: диспетчеризация действий плагина.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let request: Request = serde_json::from_str(&input)?;
    let fs = HostFs;
    let payload = match request.action.as_str() {
        "capabilities" => serde_json::to_string(&SourceCapabilities {
            protocol_version: SOURCE_PROTOCOL_VERSION,
            state_storage: true,
            incremental_sync: true,
        })?,
        "probe" => match scanner::probe(&fs) {
            Ok(priority) => {
                let supported = priority.is_some();
                emit_notification(
                    "technical",
                    "info",
                    "Проверка source завершена",
                    json!({ "supported": supported, "priority": priority }),
                );
                serde_json::to_string(&json!({
                    "supported": supported,
                    "priority": priority.unwrap_or(0),
                }))?
            }
            Err(error) => {
                emit_notification(
                    "technical",
                    "error",
                    "Проверка source не удалась",
                    json!({ "error": error }),
                );
                return Err(extism_pdk::Error::msg(error).into());
            }
        },
        "open" => {
            let portable =
                request.payload.get("mode").and_then(|value| value.as_str()) == Some("portable");
            let mode = if portable { "portable" } else { "source" };
            let (name, path) = library_label(&request.payload);
            match open_catalog(&fs, portable) {
                Ok(catalog) => {
                    let message = indexed_message("Индексация библиотеки завершена", &name, &path);
                    emit_notification(
                        "user",
                        "info",
                        &message,
                        json!({ "mode": mode, "name": name.clone(), "path": path.clone() }),
                    );
                    emit_notification(
                        "technical",
                        "info",
                        "Индекс каталога обновлён",
                        json!({ "mode": mode, "name": name, "path": path }),
                    );
                    serde_json::to_string(&OpenResponse {
                        session_id: "library".to_string(),
                        catalog: (*catalog).clone(),
                    })?
                }
                Err(error) => {
                    emit_notification(
                        "technical",
                        "error",
                        "Индексация библиотеки не удалась",
                        json!({ "error": error, "mode": mode, "name": name, "path": path }),
                    );
                    return Err(extism_pdk::Error::msg(error).into());
                }
            }
        }
        "catalog" | "list" => {
            let catalog = current_catalog();
            serde_json::to_string(&json!({ "catalog": catalog }))?
        }
        "search" => {
            let catalog = current_catalog();
            let query = request
                .payload
                .get("query")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let books = catalog
                .books
                .into_iter()
                .filter(|book| {
                    book.title.to_ascii_lowercase().contains(&query)
                        || book
                            .authors
                            .iter()
                            .any(|author| author.to_ascii_lowercase().contains(&query))
                })
                .collect::<Vec<_>>();
            serde_json::to_string(&json!({ "books": books }))?
        }
        "read" => {
            let (path, _format) = book_file_info(&request.payload)?;
            let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
            let text = if path.to_ascii_lowercase().ends_with(".epub") {
                crate::epub::read_epub_text(&bytes).map_err(extism_pdk::Error::msg)?
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            };
            serde_json::to_string(&json!({ "text": text, "title": path, "authors": [] }))?
        }
        "file_bytes" => {
            let (path, _format) = book_file_info(&request.payload)?;
            let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
            let encoded =
                base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
            serde_json::to_string(&json!({ "data": encoded, "size": bytes.len() }))?
        }
        "content" => {
            let (path, format) = book_file_info(&request.payload)?;
            if format != "epub" {
                return Err(extism_pdk::Error::msg(format!(
                    "формат не поддерживается встроенным чтением: {format}"
                ))
                .into());
            }
            let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
            let chapters =
                crate::epub::read_epub_chapters(&bytes).map_err(extism_pdk::Error::msg)?;
            let (title, authors) = book_identity(&request.payload, &path);
            serde_json::to_string(&json!({
                "title": title,
                "authors": authors,
                "chapters": chapters,
            }))?
        }
        "cover" => {
            if let Some(id) = request
                .payload
                .get("book_id")
                .and_then(|value| value.as_str())
            {
                if let Some((data, format)) =
                    crate::index::load_cover(&fs, id).map_err(extism_pdk::Error::msg)?
                {
                    serde_json::to_string(&json!({ "data": data, "format": format }))?
                } else {
                    serde_json::to_string(&json!({ "data": null }))?
                }
            } else {
                let (path, format) = book_file_info(&request.payload)?;
                match crate::metadata::cover(&fs, &path, &format) {
                    Some((bytes, cover_format)) => {
                        let encoded = base64::Engine::encode(
                            &base64::engine::general_purpose::STANDARD,
                            bytes,
                        );
                        serde_json::to_string(&json!({ "data": encoded, "format": cover_format }))?
                    }
                    None => serde_json::to_string(&json!({ "data": null }))?,
                }
            }
        }
        "open_external" => {
            let (path, _format) = book_file_info(&request.payload)?;
            fs.open_file(&path).map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "opened": true }))?
        }
        "sync" => {
            let portable =
                request.payload.get("mode").and_then(|value| value.as_str()) == Some("portable");
            let catalog = if portable {
                lifecycle::restore(&fs).map_err(extism_pdk::Error::msg)?
            } else {
                lifecycle::sync(&fs).map_err(extism_pdk::Error::msg)?
            };
            serde_json::to_string(&json!({ "catalog": &*catalog }))?
        }
        "import" => {
            let path = request
                .payload
                .get("path")
                .and_then(|value| value.as_str())
                .ok_or_else(|| extism_pdk::Error::msg("не указан файл импорта"))?;
            let book = crate::portable::import_book(&fs, path).map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "book": book }))?
        }
        other => {
            return Err(
                extism_pdk::Error::msg(format!("неизвестное действие плагина: {other}")).into(),
            )
        }
    };
    Ok(payload)
}

/// Открытие или восстановление каталога source-библиотеки.
fn open_catalog(fs: &impl Fs, portable: bool) -> Result<Rc<SourceCatalog>, String> {
    if portable {
        lifecycle::restore(fs)
    } else {
        lifecycle::open(fs)
    }
}

/// Каталог для ответа: последний согласованный или пустой snapshot.
fn current_catalog() -> SourceCatalog {
    lifecycle::catalog()
        .map(|catalog| (*catalog).clone())
        .unwrap_or(SourceCatalog {
            protocol_version: SOURCE_PROTOCOL_VERSION,
            revision: 0,
            books: Vec::new(),
        })
}

/// Путь и формат файла книги из opaque идентификатора или явного пути.
fn book_file_info(payload: &serde_json::Value) -> Result<(String, String), extism_pdk::Error> {
    if let Some(path) = payload.get("path").and_then(|value| value.as_str()) {
        let format = std::path::Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        return Ok((path.to_string(), format));
    }
    let id = payload
        .get("book_id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| extism_pdk::Error::msg("не указан идентификатор книги"))?;
    let catalog =
        lifecycle::catalog().ok_or_else(|| extism_pdk::Error::msg("каталог не открыт"))?;
    let book = catalog
        .books
        .iter()
        .find(|book| book.id == id)
        .ok_or_else(|| extism_pdk::Error::msg("книга не найдена"))?;
    book.files
        .iter()
        .find(|file| matches!(file.kind, crate::models::ExternalFileKind::Book))
        .map(|file| (file.path.clone(), file.format.clone()))
        .ok_or_else(|| extism_pdk::Error::msg("файл книги не найден"))
}

/// Название и авторы книги из каталога или из пути к файлу.
fn book_identity(payload: &serde_json::Value, path: &str) -> (String, Vec<String>) {
    let id = payload.get("book_id").and_then(|value| value.as_str());
    if let Some((title, authors)) = id.and_then(|id| {
        let catalog = lifecycle::catalog()?;
        catalog
            .books
            .iter()
            .find(|book| book.id == id)
            .map(|book| (book.title.clone(), book.authors.clone()))
    }) {
        return (title, authors);
    }
    let title = std::path::Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path)
        .to_string();
    (title, Vec::new())
}
