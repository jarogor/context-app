//! WASM-точка входа source-плагина Calibre.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! host-функции приложения и экспортируемую функцию `invoke` по контракту.

use crate::fs::Fs;
use crate::lifecycle;
use crate::models::{SourceCapabilities, SourceCatalog, SOURCE_PROTOCOL_VERSION};
use crate::scanner;
use extism_pdk::{host_fn, plugin_fn, FnResult};
use serde::Deserialize;
use serde_json::json;

/// Host-функции приложения, доступные плагину Calibre.
#[host_fn]
extern "ExtismHost" {
    /// Перечисление имён записей директории относительно корня библиотеки.
    fn fs_list_dir(path: String) -> String;
    /// Чтение бинарного файла в base64.
    fn fs_read_bytes(path: String) -> String;
    /// Открытие файла системным приложением.
    fn open_file(path: String) -> String;
    /// Удаление служебного состояния source-плагина.
    fn state_delete(key: String) -> String;
    /// Исполнение SQL в хранилище активной библиотеки.
    fn sql_execute(sql: String, params: String) -> String;
    /// Чтение строк SQL-запроса в хранилище активной библиотеки.
    fn sql_query(sql: String, params: String) -> String;
    /// Публикация прикладного события с JSON-payload.
    fn emit_event(name: String, payload: String) -> String;
    /// Публикация уведомления от source-плагина.
    fn notify(level: String, severity: String, message: String, details: String) -> String;
}

/// Реализация `Fs` поверх host-функций приложения.
struct HostFs;

/// Публикация уведомления без прерывания операции.
fn emit_notification(level: &str, severity: &str, message: &str, details: serde_json::Value) {
    let _ = unsafe {
        notify(
            level.to_string(),
            severity.to_string(),
            message.to_string(),
            details.to_string(),
        )
    };
}

impl Fs for HostFs {
    fn list_dir(&self, path: &str) -> Result<Vec<crate::models::DirEntry>, String> {
        let payload = unsafe { fs_list_dir(path.to_string()).map_err(|error| error.to_string())? };
        serde_json::from_str(&payload).map_err(|error| error.to_string())
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let payload =
            unsafe { fs_read_bytes(path.to_string()).map_err(|error| error.to_string())? };
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, payload)
            .map_err(|error| error.to_string())
    }

    fn open_file(&self, path: &str) -> Result<(), String> {
        unsafe { open_file(path.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn state_delete(&self, key: &str) -> Result<(), String> {
        unsafe { state_delete(key.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn sql_execute(&self, sql: &str, params: &str) -> Result<(), String> {
        unsafe { sql_execute(sql.to_string(), params.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn sql_query(&self, sql: &str, params: &str) -> Result<String, String> {
        unsafe { sql_query(sql.to_string(), params.to_string()) }.map_err(|error| error.to_string())
    }

    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String> {
        unsafe { emit_event(name.to_string(), payload.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
struct Request {
    /// Действие плагина source lifecycle.
    action: String,
    /// Данные операции.
    #[serde(default)]
    payload: serde_json::Value,
}

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
                    "Проверка source Calibre завершена",
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
                    "Проверка source Calibre не удалась",
                    json!({ "error": error }),
                );
                return Err(extism_pdk::Error::msg(error).into());
            }
        },
        "open" => {
            let (name, path) = library_label(&request.payload);
            match open_catalog(&fs) {
                Ok(catalog) => {
                    let message =
                        indexed_message("Индексация библиотеки Calibre завершена", &name, &path);
                    emit_notification(
                        "user",
                        "info",
                        &message,
                        json!({ "mode": "source", "name": name, "path": path }),
                    );
                    serde_json::to_string(&OpenResponse {
                        session_id: "calibre".to_string(),
                        catalog,
                    })?
                }
                Err(error) => {
                    emit_notification(
                        "technical",
                        "error",
                        "Индексация библиотеки Calibre не удалась",
                        json!({ "error": error, "name": name, "path": path }),
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
            let path = book_path(&request.payload, false)?;
            let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
            let text = if path.to_ascii_lowercase().ends_with(".epub") {
                crate::epub::read_epub_text(&bytes).map_err(extism_pdk::Error::msg)?
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            };
            serde_json::to_string(&json!({ "text": text, "title": path, "authors": [] }))?
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
                let path = book_path(&request.payload, true)?;
                let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
                let encoded =
                    base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
                let format = std::path::Path::new(&path)
                    .extension()
                    .and_then(|value| value.to_str())
                    .unwrap_or("jpg");
                serde_json::to_string(&json!({ "data": encoded, "format": format }))?
            }
        }
        "open_external" => {
            let path = book_path(&request.payload, false)?;
            fs.open_file(&path).map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "opened": true }))?
        }
        "sync" => serde_json::to_string(&json!({
            "catalog": lifecycle::sync(&fs).map_err(extism_pdk::Error::msg)?
        }))?,
        other => {
            return Err(
                extism_pdk::Error::msg(format!("неизвестное действие плагина: {other}")).into(),
            )
        }
    };
    Ok(payload)
}

/// Сканирование и открытие каталога Calibre.
fn open_catalog(fs: &impl Fs) -> Result<SourceCatalog, String> {
    lifecycle::open(fs)
}

/// Название и путь библиотеки из payload открытия.
fn library_label(payload: &serde_json::Value) -> (String, String) {
    let path = payload
        .get("path")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path.as_str())
        .to_string();
    (name, path)
}

/// Сообщение об индексации с названием и путём библиотеки.
fn indexed_message(base: &str, name: &str, path: &str) -> String {
    if path.is_empty() {
        base.to_string()
    } else {
        format!("{base}: {name} ({path})")
    }
}

/// Последний согласованный каталог или пустой snapshot.
fn current_catalog() -> SourceCatalog {
    lifecycle::catalog().unwrap_or(SourceCatalog {
        protocol_version: SOURCE_PROTOCOL_VERSION,
        revision: 0,
        books: Vec::new(),
    })
}

/// Получение пути файла книги из opaque идентификатора или явного пути.
fn book_path(payload: &serde_json::Value, cover: bool) -> Result<String, extism_pdk::Error> {
    if let Some(path) = payload.get("path").and_then(|value| value.as_str()) {
        return Ok(path.to_string());
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
        .find(|file| {
            (cover && matches!(file.kind, crate::models::ExternalFileKind::Cover))
                || (!cover && matches!(file.kind, crate::models::ExternalFileKind::Book))
        })
        .map(|file| file.path.clone())
        .ok_or_else(|| extism_pdk::Error::msg("файл книги не найден"))
}
