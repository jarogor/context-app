//! Реализация доступа source-плагина к host-функциям ядра.
//!
//! Модуль собирается только под `wasm32`: объявляет host-функции приложения и
//! реализует [`Fs`] поверх них. Плагин оставляет только диспетчеризацию действий
//! и специфику источника.

#![cfg(target_arch = "wasm32")]

use extism_pdk::host_fn;

use crate::fs::Fs;
use crate::models::DirEntry;

/// Host-функции ядра, доступные source-плагину.
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
    /// Удаление служебного состояния source-плагина.
    fn state_delete(key: String) -> String;
    /// Исполнение SQL в хранилище активной библиотеки.
    fn sql_execute(sql: String, params: String) -> String;
    /// Чтение строк SQL-запроса в хранилище активной библиотеки.
    fn sql_query(sql: String, params: String) -> String;
    /// Публикация прикладного события с JSON-payload.
    fn emit_event(name: String, payload: String) -> String;
    /// Запись сообщения source-плагина в журнал диагностики.
    fn log(severity: String, message: String, details: String);
}

/// Реализация `Fs` поверх host-функций приложения.
pub struct HostFs;

/// Запись сообщения в журнал диагностики без прерывания операции.
pub fn emit_log(severity: &str, message: &str, details: serde_json::Value) {
    let _ = unsafe {
        log(
            severity.to_string(),
            message.to_string(),
            details.to_string(),
        )
    };
}

impl Fs for HostFs {
    fn list_dir(&self, path: &str) -> Result<Vec<DirEntry>, String> {
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

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        let payload =
            unsafe { import_read_bytes(path.to_string()).map_err(|error| error.to_string())? };
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
