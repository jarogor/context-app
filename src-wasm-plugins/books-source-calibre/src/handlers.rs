//! Обработчики действий source-плагина Calibre.
//!
//! Диспетчер [`invoke`](crate::wasm::invoke) разбирает запрос, а каждый
//! обработчик выполняет одно действие поверх [`Fs`] и модели каталога. Здесь
//! живёт вся host-обвязка плагина, кроме объявления точки входа.

use crate::fs::Fs;
use crate::lifecycle;
use crate::models::{SourceCapabilities, SourceCatalog, SOURCE_PROTOCOL_VERSION};
use crate::scanner;
use serde_json::json;
use source_protocol::host::{emit_log, HostFs};
use source_protocol::labels::{indexed_message, library_label};
use source_protocol::request::Request;
use std::rc::Rc;

use crate::wasm::OpenResponse;

/// Возможности source-плагина Calibre.
pub(crate) fn capabilities() -> Result<String, String> {
    serde_json::to_string(&SourceCapabilities {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        state_storage: true,
        incremental_sync: true,
    })
    .map_err(|error| error.to_string())
}

/// Проверка пригодности каталога с публикацией технического уведомления.
pub(crate) fn probe() -> Result<String, String> {
    let fs = HostFs;
    match scanner::probe(&fs) {
        Ok(priority) => {
            let supported = priority.is_some();
            emit_log(
                "info",
                "Проверка source Calibre завершена",
                json!({ "supported": supported, "priority": priority }),
            );
            serde_json::to_string(&json!({
                "supported": supported,
                "priority": priority.unwrap_or(0),
            }))
            .map_err(|error| error.to_string())
        }
        Err(error) => {
            emit_log(
                "error",
                "Проверка source Calibre не удалась",
                json!({ "error": error }),
            );
            Err(error)
        }
    }
}

/// Сканирование и открытие каталога Calibre с публикацией уведомлений.
pub(crate) fn open(request: &Request) -> Result<String, String> {
    let fs = HostFs;
    let (name, path) = library_label(&request.payload);
    match open_catalog(&fs) {
        Ok(catalog) => {
            let message = indexed_message("Индексация библиотеки Calibre завершена", &name, &path);
            emit_log(
                "info",
                &message,
                json!({ "mode": "source", "name": name, "path": path }),
            );
            serde_json::to_string(&OpenResponse {
                session_id: "calibre".to_string(),
                catalog: (*catalog).clone(),
            })
            .map_err(|error| error.to_string())
        }
        Err(error) => {
            emit_log(
                "error",
                "Индексация библиотеки Calibre не удалась",
                json!({ "error": error, "name": name, "path": path }),
            );
            Err(error)
        }
    }
}

/// Последний согласованный каталог.
pub(crate) fn catalog(_request: &Request) -> Result<String, String> {
    let catalog = current_catalog();
    serde_json::to_string(&json!({ "catalog": &*catalog })).map_err(|error| error.to_string())
}

/// Поиск книг каталога по названию или автору.
pub(crate) fn search(request: &Request) -> Result<String, String> {
    let catalog = current_catalog();
    let query = request
        .payload
        .get("query")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_lowercase();
    let books = catalog
        .books
        .iter()
        .filter(|book| {
            book.title.to_lowercase().contains(&query)
                || book
                    .authors
                    .iter()
                    .any(|author| author.to_lowercase().contains(&query))
        })
        .cloned()
        .collect::<Vec<_>>();
    serde_json::to_string(&json!({ "books": books })).map_err(|error| error.to_string())
}

/// Текст книги: извлечение EPUB или чтение как текста.
pub(crate) fn read(request: &Request) -> Result<String, String> {
    let fs = HostFs;
    let path = book_path(&request.payload, false)?;
    let bytes = fs.read_bytes(&path)?;
    let text = if path.to_ascii_lowercase().ends_with(".epub") {
        crate::epub::read_epub_text(&bytes)?
    } else {
        String::from_utf8_lossy(&bytes).into_owned()
    };
    serde_json::to_string(&json!({ "text": text, "title": path, "authors": [] }))
        .map_err(|error| error.to_string())
}

/// Обложка книги из индекса, из файла книги или из соседнего файла `cover.*`.
///
/// С индексом (`book_id`) обложка берётся из каталога библиотеки. С путём
/// (`path`) книга адресуется файлом, и библиотека может быть не открыта — тогда
/// обложка ищется в самой папке книги: у Calibre это отдельный файл `cover.jpg`
/// рядом с файлом книги (встроенной обложки у PDF/DjVu нет). Если соседнего
/// файла нет, обложки нет: возвращается `null`, а не сам файл книги.
pub(crate) fn cover(request: &Request) -> Result<String, String> {
    let fs = HostFs;
    if let Some(id) = request
        .payload
        .get("book_id")
        .and_then(|value| value.as_str())
    {
        if let Some((data, format)) = crate::index::load_cover(&fs, id)? {
            serde_json::to_string(&json!({ "data": data, "format": format }))
                .map_err(|error| error.to_string())
        } else {
            serde_json::to_string(&json!({ "data": null })).map_err(|error| error.to_string())
        }
    } else if let Some(path) = request.payload.get("path").and_then(|value| value.as_str()) {
        match crate::scanner::sibling_cover(&fs, path)? {
            Some((bytes, format)) => {
                let encoded =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
                serde_json::to_string(&json!({ "data": encoded, "format": format }))
                    .map_err(|error| error.to_string())
            }
            None => {
                serde_json::to_string(&json!({ "data": null })).map_err(|error| error.to_string())
            }
        }
    } else {
        let path = book_path(&request.payload, true)?;
        let bytes = fs.read_bytes(&path)?;
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
        let format = std::path::Path::new(&path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("jpg");
        serde_json::to_string(&json!({ "data": encoded, "format": format }))
            .map_err(|error| error.to_string())
    }
}

/// Открытие файла книги системным приложением.
pub(crate) fn open_external(request: &Request) -> Result<String, String> {
    let fs = HostFs;
    let path = book_path(&request.payload, false)?;
    fs.open_file(&path)?;
    serde_json::to_string(&json!({ "opened": true })).map_err(|error| error.to_string())
}

/// Синхронизация каталога Calibre.
pub(crate) fn sync(_request: &Request) -> Result<String, String> {
    let fs = HostFs;
    serde_json::to_string(&json!({ "catalog": &*lifecycle::sync(&fs)? }))
        .map_err(|error| error.to_string())
}

/// Сканирование и открытие каталога Calibre.
fn open_catalog(fs: &impl Fs) -> Result<Rc<SourceCatalog>, String> {
    lifecycle::open(fs)
}

/// Последний согласованный каталог или пустой snapshot.
fn current_catalog() -> Rc<SourceCatalog> {
    lifecycle::catalog().unwrap_or_else(|| {
        Rc::new(SourceCatalog {
            protocol_version: SOURCE_PROTOCOL_VERSION,
            revision: 0,
            books: Vec::new(),
        })
    })
}

/// Получение пути файла книги из opaque идентификатора или явного пути.
fn book_path(payload: &serde_json::Value, cover: bool) -> Result<String, String> {
    if let Some(path) = payload.get("path").and_then(|value| value.as_str()) {
        return Ok(path.to_string());
    }
    let id = payload
        .get("book_id")
        .and_then(|value| value.as_str())
        .ok_or_else(|| "не указан идентификатор книги".to_string())?;
    let catalog = lifecycle::catalog().ok_or_else(|| "каталог не открыт".to_string())?;
    let book = catalog
        .books
        .iter()
        .find(|book| book.id == id)
        .ok_or_else(|| "книга не найдена".to_string())?;
    book.files
        .iter()
        .find(|file| {
            (cover && matches!(file.kind, crate::models::ExternalFileKind::Cover))
                || (!cover && matches!(file.kind, crate::models::ExternalFileKind::Book))
        })
        .map(|file| file.path.clone())
        .ok_or_else(|| "файл книги не найден".to_string())
}
