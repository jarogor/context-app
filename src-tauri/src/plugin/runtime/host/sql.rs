//! SQLite-хранилище плагина и host-функции SQL.

use std::fs;
use std::path::PathBuf;

use sha2::{Digest, Sha256};

use extism::{CurrentPlugin, UserData, Val};

use super::super::host_state::HostState;

/// Разрешение пути к SQLite-базе плагина в служебной области приложения.
///
/// База изолирована на библиотеку и провайдера:
/// `<storage_root>/<plugin_id>/<sha256(канонический корень)>/index.sqlite`.
/// Файл лежит вне директории библиотеки, что сохраняет read-only источника.
pub(crate) fn sqlite_database_path(state: &HostState) -> Result<PathBuf, String> {
    let storage = state.storage_root()?;
    let sandbox = state
        .roots
        .sandbox_root
        .lock()
        .map_err(|_| "песочный корень недоступен".to_string())?
        .canonical_or_self();
    let mut hasher = Sha256::new();
    hasher.update(sandbox.to_string_lossy().as_bytes());
    let digest = format!("{:x}", hasher.finalize());
    Ok(storage
        .join(&state.plugin_id)
        .join(digest)
        .join("index.sqlite"))
}

/// Открытие соединения с SQLite-базой плагина с созданием каталога.
fn open_sqlite(state: &HostState) -> Result<(), String> {
    let mut guard = state
        .sqlite
        .lock()
        .map_err(|_| "SQL-хранилище недоступно".to_string())?;
    if guard.is_some() {
        return Ok(());
    }
    let path = sqlite_database_path(state)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let connection = rusqlite::Connection::open(&path).map_err(|error| error.to_string())?;
    *guard = Some(connection);
    Ok(())
}

/// Разбор JSON-массива параметров в значения SQLite.
pub(crate) fn parse_sql_params(raw: &str) -> Result<Vec<rusqlite::types::Value>, String> {
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
fn sqlite_value_to_json(value: rusqlite::types::ValueRef<'_>) -> serde_json::Value {
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

/// Исполнение SQL в SQLite-хранилище состояния.
///
/// Пустой список параметров допускает несколько выражений (скрипт, DDL);
/// непустой список исполняет один параметризованный запрос.
pub(crate) fn execute_sql(
    state: &HostState,
    sql: &str,
    params: Vec<rusqlite::types::Value>,
) -> Result<(), String> {
    open_sqlite(state)?;
    let guard = state
        .sqlite
        .lock()
        .map_err(|_| "SQL-хранилище недоступно".to_string())?;
    let connection = guard
        .as_ref()
        .ok_or_else(|| "SQL-хранилище не открыто".to_string())?;
    if params.is_empty() {
        connection
            .execute_batch(sql)
            .map_err(|error| error.to_string())
    } else {
        connection
            .execute(sql, rusqlite::params_from_iter(params))
            .map(|_| ())
            .map_err(|error| error.to_string())
    }
}

/// Чтение строк SQL-запроса как JSON-массива объектов «столбец → значение».
pub(crate) fn query_sql(
    state: &HostState,
    sql: &str,
    params: Vec<rusqlite::types::Value>,
) -> Result<Vec<serde_json::Value>, String> {
    open_sqlite(state)?;
    let guard = state
        .sqlite
        .lock()
        .map_err(|_| "SQL-хранилище недоступно".to_string())?;
    let connection = guard
        .as_ref()
        .ok_or_else(|| "SQL-хранилище не открыто".to_string())?;
    let mut statement = connection.prepare(sql).map_err(|error| error.to_string())?;
    let columns: Vec<String> = statement
        .column_names()
        .iter()
        .map(|name| (*name).to_string())
        .collect();
    let mut rows = statement
        .query(rusqlite::params_from_iter(params))
        .map_err(|error| error.to_string())?;
    let mut result = Vec::new();
    while let Some(row) = rows.next().map_err(|error| error.to_string())? {
        let mut object = serde_json::Map::with_capacity(columns.len());
        for (index, name) in columns.iter().enumerate() {
            let value = row.get_ref(index).map_err(|error| error.to_string())?;
            object.insert(name.clone(), sqlite_value_to_json(value));
        }
        result.push(serde_json::Value::Object(object));
    }
    Ok(result)
}

/// Host-функция `sql_execute`: исполнение SQL в хранилище активной библиотеки.
pub(super) fn host_sql_execute(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let sql: String = plugin.memory_get_val(&args[0])?;
    let params_raw: String = plugin.memory_get_val(&args[1])?;
    let params = parse_sql_params(&params_raw).map_err(extism::Error::msg)?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("SQL-хранилище недоступно"))?;
    execute_sql(&state, &sql, params).map_err(extism::Error::msg)?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `sql_query`: чтение строк SQL-запроса как JSON-массива объектов.
pub(super) fn host_sql_query(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let sql: String = plugin.memory_get_val(&args[0])?;
    let params_raw: String = plugin.memory_get_val(&args[1])?;
    let params = parse_sql_params(&params_raw).map_err(extism::Error::msg)?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("SQL-хранилище недоступно"))?;
    let result = query_sql(&state, &sql, params).map_err(extism::Error::msg)?;
    let payload = serde_json::to_string(&result)
        .map_err(|_| extism::Error::msg("не удалось сериализовать результат SQL"))?;
    plugin
        .memory_set_val(&mut returns[0], &payload)
        .map_err(|err| extism::Error::msg(err.to_string()))
}
