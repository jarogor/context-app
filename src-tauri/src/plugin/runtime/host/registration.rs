//! Регистрация host-функций в builder плагина.
//!
//! Плагин получает только объявленные права: host-функция, не названная в
//! `host_functions` манифеста, не регистрируется в runtime, и её вызов плагином
//! отклоняется как вызов в неизвестную функцию.

use extism::{PluginBuilder, UserData, ValType};

use crate::plugin::contract::{
    HOST_EMIT_EVENT, HOST_FS_LIST_DIR, HOST_FS_READ_BYTES, HOST_FS_READ_TEXT, HOST_FS_WRITE_BYTES,
    HOST_IMPORT_READ_BYTES, HOST_LOG_FUNCTION, HOST_NOTIFY_FUNCTION, HOST_NOW_FUNCTION,
    HOST_OPEN_FILE, HOST_SQL_EXECUTE, HOST_SQL_QUERY, HOST_STATE_DELETE, HOST_STATE_READ,
    HOST_STATE_WRITE, HOST_STORE_FETCH, HOST_STORE_INSPECT, HOST_STORE_INSTALL,
    HOST_STORE_INSTALLED, HOST_STORE_PLUGINS, HOST_STORE_READ, HOST_STORE_SET_ENABLED,
    HOST_STORE_UNINSTALL,
};
use crate::plugin::PluginManifest;

use super::super::host_state::RuntimeRoots;
use super::{fs, log, sql, state, store};

/// Регистрация host-функций, объявленных в манифесте плагина.
///
/// Каждая host-функция выдаётся только плагину, объявившему её в
/// `host_functions`; необъявленная функция в runtime отсутствует, поэтому её
/// вызов отклоняется. Состав функций и их сигнатуры заданы контрактом.
pub(crate) fn register<'a>(
    mut builder: PluginBuilder<'a>,
    roots: &RuntimeRoots,
    manifest: &PluginManifest,
) -> PluginBuilder<'a> {
    let host_state = roots.host_state(&manifest.id);
    let declares = |function: &str| declares_host_function(manifest, function);
    let user_data = || UserData::new(host_state.clone());

    if declares(HOST_LOG_FUNCTION) {
        builder = builder.with_function(
            HOST_LOG_FUNCTION,
            [ValType::I64, ValType::I64, ValType::I64],
            [],
            user_data(),
            log::host_log,
        );
    }
    if declares(HOST_NOTIFY_FUNCTION) {
        builder = builder.with_function(
            HOST_NOTIFY_FUNCTION,
            [ValType::I64, ValType::I64, ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            log::host_notify,
        );
    }
    if declares(HOST_FS_LIST_DIR) {
        builder = builder.with_function(
            HOST_FS_LIST_DIR,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            fs::host_fs_list_dir,
        );
    }
    if declares(HOST_FS_READ_TEXT) {
        builder = builder.with_function(
            HOST_FS_READ_TEXT,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            fs::host_fs_read_text,
        );
    }
    if declares(HOST_FS_READ_BYTES) {
        builder = builder.with_function(
            HOST_FS_READ_BYTES,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            fs::host_fs_read_bytes,
        );
    }
    if declares(HOST_IMPORT_READ_BYTES) {
        builder = builder.with_function(
            HOST_IMPORT_READ_BYTES,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            fs::host_import_read_bytes,
        );
    }
    if declares(HOST_FS_WRITE_BYTES) {
        builder = builder.with_function(
            HOST_FS_WRITE_BYTES,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            fs::host_fs_write_bytes,
        );
    }
    if declares(HOST_OPEN_FILE) {
        builder = builder.with_function(
            HOST_OPEN_FILE,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            fs::host_open_file,
        );
    }
    if declares(HOST_STATE_READ) {
        builder = builder.with_function(
            HOST_STATE_READ,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            state::host_state_read,
        );
    }
    if declares(HOST_STATE_WRITE) {
        builder = builder.with_function(
            HOST_STATE_WRITE,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            state::host_state_write,
        );
    }
    if declares(HOST_STATE_DELETE) {
        builder = builder.with_function(
            HOST_STATE_DELETE,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            state::host_state_delete,
        );
    }
    if declares(HOST_NOW_FUNCTION) {
        builder = builder.with_function(
            HOST_NOW_FUNCTION,
            [],
            [ValType::I64],
            user_data(),
            log::host_now_millis,
        );
    }
    if declares(HOST_EMIT_EVENT) {
        builder = builder.with_function(
            HOST_EMIT_EVENT,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            log::host_emit_event,
        );
    }
    if declares(HOST_SQL_EXECUTE) {
        builder = builder.with_function(
            HOST_SQL_EXECUTE,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            sql::host_sql_execute,
        );
    }
    if declares(HOST_SQL_QUERY) {
        builder = builder.with_function(
            HOST_SQL_QUERY,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            sql::host_sql_query,
        );
    }
    if declares(HOST_STORE_INSPECT) {
        builder = builder.with_function(
            HOST_STORE_INSPECT,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            store::host_store_inspect,
        );
    }
    if declares(HOST_STORE_INSTALL) {
        builder = builder.with_function(
            HOST_STORE_INSTALL,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            store::host_store_install,
        );
    }
    if declares(HOST_STORE_UNINSTALL) {
        builder = builder.with_function(
            HOST_STORE_UNINSTALL,
            [ValType::I64],
            [ValType::I64],
            user_data(),
            store::host_store_uninstall,
        );
    }
    if declares(HOST_STORE_INSTALLED) {
        builder = builder.with_function(
            HOST_STORE_INSTALLED,
            [],
            [ValType::I64],
            user_data(),
            store::host_store_installed,
        );
    }
    if declares(HOST_STORE_PLUGINS) {
        builder = builder.with_function(
            HOST_STORE_PLUGINS,
            [],
            [ValType::I64],
            user_data(),
            store::host_store_plugins,
        );
    }
    if declares(HOST_STORE_SET_ENABLED) {
        builder = builder.with_function(
            HOST_STORE_SET_ENABLED,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            store::host_store_set_enabled,
        );
    }
    if declares(HOST_STORE_READ) {
        builder = builder.with_function(
            HOST_STORE_READ,
            [ValType::I64, ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            store::host_store_read,
        );
    }
    if declares(HOST_STORE_FETCH) {
        builder = builder.with_function(
            HOST_STORE_FETCH,
            [ValType::I64, ValType::I64, ValType::I64, ValType::I64],
            [ValType::I64],
            user_data(),
            store::host_store_fetch,
        );
    }

    builder
}

/// Признак, что манифест объявил host-функцию.
pub(crate) fn declares_host_function(manifest: &PluginManifest, function: &str) -> bool {
    manifest
        .host_functions
        .iter()
        .any(|value| value == function)
}

#[cfg(test)]
#[path = "registration_tests.rs"]
mod tests;
