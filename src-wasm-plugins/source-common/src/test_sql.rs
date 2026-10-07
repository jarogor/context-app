//! Нативный SQL-движок для тестов source-плагинов.
//!
//! В WASM-окружении SQL предоставляет ядро через host-функции. В нативных
//! тестах используется настоящее SQLite (dev-dependency `rusqlite`), чтобы
//! проверять именно те запросы, которые формирует плагин.
//!
//! Модуль собирается только с feature `test-sql`.

use std::cell::RefCell;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

thread_local! {
    static CONNECTIONS: RefCell<HashMap<PathBuf, rusqlite::Connection>> =
        RefCell::new(HashMap::new());
}

/// Исполнение SQL в соединении, привязанном к корню библиотеки.
pub fn execute(root: &Path, sql: &str, params: &str) -> Result<(), String> {
    let parsed = parse_params(params)?;
    with_connection(root, |connection| {
        if parsed.is_empty() {
            connection
                .execute_batch(sql)
                .map_err(|error| error.to_string())
        } else {
            connection
                .execute(sql, rusqlite::params_from_iter(parsed))
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
    })
}

/// Чтение строк запроса как JSON-массива объектов «столбец → значение».
pub fn query(root: &Path, sql: &str, params: &str) -> Result<String, String> {
    let parsed = parse_params(params)?;
    with_connection(root, |connection| {
        let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
        let columns: Vec<String> = statement
            .column_names()
            .iter()
            .map(|name| (*name).to_string())
            .collect();
        let mut rows = statement
            .query(rusqlite::params_from_iter(parsed))
            .map_err(|error| error.to_string())?;
        let mut result = Vec::new();
        while let Some(row) = rows.next().map_err(|error| error.to_string())? {
            let mut object = serde_json::Map::with_capacity(columns.len());
            for (index, name) in columns.iter().enumerate() {
                let value = row.get_ref(index).map_err(|error| error.to_string())?;
                object.insert(name.clone(), value_to_json(value));
            }
            result.push(serde_json::Value::Object(object));
        }
        serde_json::to_string(&result).map_err(|error| error.to_string())
    })
}

/// Получение или создание соединения для корня библиотеки.
fn with_connection<T>(
    root: &Path,
    action: impl FnOnce(&rusqlite::Connection) -> Result<T, String>,
) -> Result<T, String> {
    CONNECTIONS.with(|connections| {
        let mut connections = connections.borrow_mut();
        if !connections.contains_key(root) {
            let connection =
                rusqlite::Connection::open_in_memory().map_err(|error| error.to_string())?;
            connections.insert(root.to_path_buf(), connection);
        }
        let connection = connections
            .get(root)
            .ok_or_else(|| "соединение недоступно".to_string())?;
        action(connection)
    })
}

/// Разбор JSON-массива параметров в значения SQLite.
fn parse_params(raw: &str) -> Result<Vec<rusqlite::types::Value>, String> {
    let value: serde_json::Value = serde_json::from_str(raw).map_err(|error| error.to_string())?;
    let array = value
        .as_array()
        .ok_or_else(|| "параметры SQL должны быть JSON-массивом".to_string())?;
    let mut params = Vec::with_capacity(array.len());
    for item in array {
        let value = match item {
            serde_json::Value::Null => rusqlite::types::Value::Null,
            serde_json::Value::Bool(flag) => rusqlite::types::Value::Integer(i64::from(*flag)),
            serde_json::Value::Number(number) => {
                if let Some(integer) = number.as_i64() {
                    rusqlite::types::Value::Integer(integer)
                } else if let Some(float) = number.as_f64() {
                    rusqlite::types::Value::Real(float)
                } else {
                    return Err("неподдерживаемое число в параметрах SQL".to_string());
                }
            }
            serde_json::Value::String(text) => rusqlite::types::Value::Text(text.clone()),
            _ => return Err("неподдерживаемый параметр SQL".to_string()),
        };
        params.push(value);
    }
    Ok(params)
}

/// Преобразование значения SQLite в JSON.
fn value_to_json(value: rusqlite::types::ValueRef<'_>) -> serde_json::Value {
    use rusqlite::types::ValueRef;
    match value {
        ValueRef::Null => serde_json::Value::Null,
        ValueRef::Integer(integer) => serde_json::Value::from(integer),
        ValueRef::Real(float) => serde_json::Number::from_f64(float)
            .map(serde_json::Value::Number)
            .unwrap_or(serde_json::Value::Null),
        ValueRef::Text(bytes) => {
            serde_json::Value::String(String::from_utf8_lossy(bytes).into_owned())
        }
        ValueRef::Blob(bytes) => serde_json::Value::String(base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            bytes,
        )),
    }
}
