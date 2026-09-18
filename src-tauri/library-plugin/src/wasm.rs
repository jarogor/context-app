//! WASM-точка входа плагина.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: объявляет
//! host-функции приложения и экспортируемую функцию `invoke` по контракту.

use crate::fs::Fs;
use crate::models::ExternalBook;
use crate::scanner;
use extism_pdk::{host_fn, plugin_fn, FnResult};
use serde::Deserialize;
use serde_json::json;

/// Host-функция `fs_list_dir`: перечисление имён записей директории.
#[host_fn]
extern "ExtismHost" {
    /// Перечисление имён записей директории относительно корня библиотеки.
    fn fs_list_dir(path: String) -> String;
}

/// Реализация `Fs` поверх host-функций приложения.
struct HostFs;

impl Fs for HostFs {
    fn list_dir(&self, path: &str) -> Result<Vec<String>, String> {
        let payload = unsafe { fs_list_dir(path.to_string()).map_err(|error| error.to_string())? };
        serde_json::from_str(&payload).map_err(|error| error.to_string())
    }
}

/// Запрос от приложения по контракту.
#[derive(Deserialize)]
struct Request {
    /// Действие плагина: `probe`, `scan` или `scan_book`.
    action: String,
    /// Относительный путь папки книги для действия `scan_book`.
    #[serde(default)]
    path: String,
}

/// Точка расширения: диспетчеризация действий плагина.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let request: Request = serde_json::from_str(&input)?;
    let fs = HostFs;
    let payload = match request.action.as_str() {
        "probe" => serde_json::to_string(&json!({
            "supported": scanner::probe(&fs).map_err(extism_pdk::Error::msg)?
        }))?,
        "scan" => {
            let books: Vec<ExternalBook> =
                scanner::scan(&fs).map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "books": books }))?
        }
        "scan_book" => {
            let book = scanner::scan_book_path(&fs, &request.path).map_err(extism_pdk::Error::msg)?;
            serde_json::to_string(&json!({ "book": book }))?
        }
        other => {
            return Err(extism_pdk::Error::msg(format!(
                "неизвестное действие плагина: {other}"
            ))
            .into())
        }
    };
    Ok(payload)
}