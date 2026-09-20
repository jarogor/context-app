//! WASM-точка входа плагина.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! host-функции приложения и экспортируемую функцию `invoke` по контракту.

use crate::fs::Fs;
use crate::lifecycle;
use crate::models::{ExternalBook, SourceCapabilities, SourceCatalog, SOURCE_PROTOCOL_VERSION};
use crate::scanner;
use extism_pdk::{host_fn, plugin_fn, FnResult};
use serde::Deserialize;
use serde_json::json;
use std::io::{Cursor, Read};
use quick_xml::events::Event;
use quick_xml::Reader;
use zip::ZipArchive;

/// Host-функция `fs_list_dir`: перечисление имён записей директории.
#[host_fn]
extern "ExtismHost" {
    /// Перечисление имён записей директории относительно корня библиотеки.
    fn fs_list_dir(path: String) -> String;
    /// Чтение бинарного файла в base64.
    fn fs_read_bytes(path: String) -> String;
    /// Чтение выбранного пользователем EPUB-файла.
    fn import_read_bytes(path: String) -> String;
    /// Запись файла portable-библиотеки в base64.
    fn fs_write_bytes(path: String, value: String) -> String;
    /// Открытие файла системным приложением.
    fn open_file(path: String) -> String;
    /// Чтение служебного состояния source-плагина.
    fn state_read(key: String) -> String;
    /// Запись служебного состояния source-плагина.
    fn state_write(key: String, value: String) -> String;
    /// Удаление служебного состояния source-плагина.
    fn state_delete(key: String) -> String;
    /// Публикация уведомления от source-плагина.
    fn notify(level: String, message: String, details: String) -> String;
}

/// Реализация `Fs` поверх host-функций приложения.
struct HostFs;

fn emit_notification(level: &str, message: &str, details: serde_json::Value) {
    let _ = unsafe {
        notify(
            level.to_string(),
            message.to_string(),
            details.to_string(),
        )
    };
}

impl Fs for HostFs {
    fn list_dir(&self, path: &str) -> Result<Vec<String>, String> {
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

    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        let value = unsafe { state_read(key.to_string()).map_err(|error| error.to_string())? };
        if value.is_empty() {
            Ok(None)
        } else {
            Ok(Some(value))
        }
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        unsafe { state_write(key.to_string(), value.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn state_delete(&self, key: &str) -> Result<(), String> {
        unsafe { state_delete(key.to_string()) }
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let payload = unsafe { import_read_bytes(path.to_string()).map_err(|error| error.to_string())? };
        base64::Engine::decode(&base64::engine::general_purpose::STANDARD, payload)
            .map_err(|error| error.to_string())
    }

    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
        unsafe { fs_write_bytes(path.to_string(), encoded) }
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
        "probe" => {
            let supported = scanner::probe(&fs).map_err(extism_pdk::Error::msg)?;
            emit_notification(
                "technical",
                "Проверка source завершена",
                json!({ "supported": supported }),
            );
            serde_json::to_string(&json!({ "supported": supported }))?
        }
        "open" => {
            let portable = request
                .payload
                .get("mode")
                .and_then(|value| value.as_str())
                == Some("portable");
            let books: Vec<ExternalBook> = if portable {
                Vec::new()
            } else {
                scanner::scan(&fs).map_err(extism_pdk::Error::msg)?
            };
            let response = serde_json::to_string(&OpenResponse {
                session_id: "library".to_string(),
                catalog: if portable {
                    lifecycle::restore(&fs).map_err(extism_pdk::Error::msg)?
                } else {
                    lifecycle::open(&fs, books).map_err(extism_pdk::Error::msg)?
                },
            })?;
            emit_notification(
                "user",
                "Индексация библиотеки завершена",
                json!({ "mode": if portable { "portable" } else { "source" } }),
            );
            emit_notification(
                "technical",
                "Индекс каталога обновлён",
                json!({ "mode": if portable { "portable" } else { "source" } }),
            );
            response
        }
        "catalog" | "list" => {
            let catalog = lifecycle::catalog().unwrap_or(SourceCatalog {
                protocol_version: SOURCE_PROTOCOL_VERSION,
                revision: 0,
                books: Vec::new(),
            });
            serde_json::to_string(&json!({ "catalog": catalog }))?
        }
        "search" => {
            let payload = lifecycle::catalog().unwrap_or(SourceCatalog {
                protocol_version: SOURCE_PROTOCOL_VERSION,
                revision: 0,
                books: Vec::new(),
            });
            let query = request
                .payload
                .get("query")
                .and_then(|value| value.as_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            let books = payload
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
            let path = book_path(&fs, &request.payload, false)?;
            let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
            let text = if path.to_ascii_lowercase().ends_with(".epub") {
                read_epub_text(&bytes)?
            } else {
                String::from_utf8_lossy(&bytes).into_owned()
            };
            serde_json::to_string(&json!({ "text": text, "title": path, "authors": [] }))?
        }
        "cover" => {
            let path = book_path(&fs, &request.payload, true)?;
            let bytes = fs.read_bytes(&path).map_err(extism_pdk::Error::msg)?;
            let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
            let format = std::path::Path::new(&path)
                .extension()
                .and_then(|value| value.to_str())
                .unwrap_or("jpg");
            serde_json::to_string(&json!({ "data": encoded, "format": format }))?
        }
        "open_external" => {
            let path = book_path(&fs, &request.payload, false)?;
            fs.open_file(&path).map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "opened": true }))?
        }
        "sync" => {
            let portable = request
                .payload
                .get("mode")
                .and_then(|value| value.as_str())
                == Some("portable");
            let books: Vec<ExternalBook> = if portable {
                Vec::new()
            } else {
                scanner::scan(&fs).map_err(extism_pdk::Error::msg)?
            };
            serde_json::to_string(&json!({
                "catalog": if portable {
                    lifecycle::restore(&fs).map_err(extism_pdk::Error::msg)?
                } else {
                    lifecycle::sync(&fs, books).map_err(extism_pdk::Error::msg)?
                }
            }))?
        }
        "recent_list" => {
            let paths = recent_paths(&fs)?;
            serde_json::to_string(&json!({
                "paths": paths.into_iter().map(|path| json!({ "path": path, "available": true })).collect::<Vec<_>>()
            }))?
        }
        "recent_remember" => {
            let path = request
                .payload
                .get("path")
                .and_then(|value| value.as_str())
                .ok_or_else(|| extism_pdk::Error::msg("не указан путь каталога"))?;
            let mut paths = recent_paths(&fs)?;
            paths.retain(|current| current != path);
            paths.insert(0, path.to_string());
            let value = serde_json::to_string(&paths)?;
            fs.state_write("recent-libraries.json", &value)
                .map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "saved": true }))?
        }
        "recent_forget" => {
            let path = request
                .payload
                .get("path")
                .and_then(|value| value.as_str())
                .ok_or_else(|| extism_pdk::Error::msg("не указан путь каталога"))?;
            let mut paths = recent_paths(&fs)?;
            paths.retain(|current| current != path);
            let value = serde_json::to_string(&paths)?;
            fs.state_write("recent-libraries.json", &value)
                .map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "removed": true }))?
        }
        "import" => {
            let path = request
                .payload
                .get("path")
                .and_then(|value| value.as_str())
                .ok_or_else(|| extism_pdk::Error::msg("не указан файл импорта"))?;
            let bytes = fs.import_read_bytes(path).map_err(extism_pdk::Error::msg)?;
            let (title, authors) = parse_epub_metadata(&bytes)?;
            let id = format!("portable/{title}");
            let book_path = format!("books/{}.epub", sanitize_name(&title));
            let book = ExternalBook {
                id: id.clone(),
                title,
                authors,
                tags: Vec::new(),
                series: Vec::new(),
                files: vec![crate::models::ExternalFile {
                    kind: crate::models::ExternalFileKind::Book,
                    path: book_path.clone(),
                    format: "epub".to_string(),
                }],
            };
            fs.write_bytes(&book_path, &bytes).map_err(extism_pdk::Error::msg)?;
            let mut catalog = lifecycle::catalog().unwrap_or(SourceCatalog {
                protocol_version: SOURCE_PROTOCOL_VERSION,
                revision: 0,
                books: Vec::new(),
            });
            catalog.books.retain(|current| current.id != id);
            catalog.books.push(book.clone());
            lifecycle::replace(&fs, catalog.clone()).map_err(extism_pdk::Error::msg)?;
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

/// Чтение списка последних корней из plugin-owned state.
fn recent_paths(fs: &impl crate::fs::Fs) -> Result<Vec<String>, extism_pdk::Error> {
    let Some(value) = fs
        .state_read("recent-libraries.json")
        .map_err(extism_pdk::Error::msg)?
    else {
        return Ok(Vec::new());
    };
    Ok(serde_json::from_str(&value).unwrap_or_default())
}

/// Получение пути файла книги из opaque идентификатора или явного пути.
fn book_path(
    _fs: &impl crate::fs::Fs,
    payload: &serde_json::Value,
    cover: bool,
) -> Result<String, extism_pdk::Error> {
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

/// Нормализация имени файла в portable storage.
fn sanitize_name(value: &str) -> String {
    value
        .chars()
        .map(|character| if character.is_ascii_alphanumeric() { character } else { '_' })
        .collect()
}

/// Извлечение базовых EPUB metadata внутри WASM без доступа к ОС.
fn parse_epub_metadata(bytes: &[u8]) -> Result<(String, Vec<String>), extism_pdk::Error> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| extism_pdk::Error::msg("не удалось открыть EPUB"))?;
    let container = archive
        .by_name("META-INF/container.xml")
        .map_err(|_| extism_pdk::Error::msg("в EPUB отсутствует container.xml"))?;
    let container_text = container
        .bytes()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| extism_pdk::Error::msg("не удалось прочитать container.xml"))?;
    let rootfile = text_between(&container_text, "full-path")
        .ok_or_else(|| extism_pdk::Error::msg("в EPUB отсутствует content.opf"))?;
    let opf = archive
        .by_name(&rootfile)
        .map_err(|_| extism_pdk::Error::msg("не удалось открыть content.opf"))?;
    let opf_text = opf
        .bytes()
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| extism_pdk::Error::msg("не удалось прочитать content.opf"))?;
    let title = text_between(&opf_text, "dc:title").unwrap_or_else(|| "Без названия".to_string());
    let authors = all_text_between(&opf_text, "dc:creator");
    Ok((title, authors))
}

fn text_between(bytes: &[u8], tag: &str) -> Option<String> {
    all_text_between(bytes, tag).into_iter().next()
}

fn all_text_between(bytes: &[u8], tag: &str) -> Vec<String> {
    let mut reader = Reader::from_reader(bytes);
    reader.config_mut().trim_text(true);
    let mut buffer = Vec::new();
    let mut active = false;
    let mut values = Vec::new();
    let mut current = String::new();
    loop {
        match reader.read_event_into(&mut buffer) {
            Ok(Event::Start(event)) => {
                active = String::from_utf8_lossy(event.name().as_ref()).ends_with(tag);
                current.clear();
            }
            Ok(Event::Text(event)) if active => {
                current.push_str(&String::from_utf8_lossy(event.as_ref()));
            }
            Ok(Event::End(_)) if active => {
                if !current.is_empty() { values.push(current.clone()); }
                active = false;
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buffer.clear();
    }
    values
}

/// Извлечение текста XHTML-глав из EPUB внутри WASM.
fn read_epub_text(bytes: &[u8]) -> Result<String, extism_pdk::Error> {
    let mut archive = ZipArchive::new(Cursor::new(bytes))
        .map_err(|_| extism_pdk::Error::msg("не удалось открыть EPUB"))?;
    let mut chapters = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|_| extism_pdk::Error::msg("не удалось прочитать EPUB"))?;
        let name = file.name().to_ascii_lowercase();
        if !(name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")) {
            continue;
        }
        let mut content = String::new();
        file.read_to_string(&mut content)
            .map_err(|_| extism_pdk::Error::msg("глава EPUB не является текстом"))?;
        chapters.push(strip_markup(&content));
    }
    Ok(chapters.join("\n\n"))
}

fn strip_markup(value: &str) -> String {
    let mut result = String::new();
    let mut inside = false;
    for character in value.chars() {
        match character {
            '<' => inside = true,
            '>' => inside = false,
            character if !inside => result.push(character),
            _ => {}
        }
    }
    result.split_whitespace().collect::<Vec<_>>().join(" ")
}
