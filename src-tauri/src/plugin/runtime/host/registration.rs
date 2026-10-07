//! Регистрация host-функций в builder плагина.

use extism::{PluginBuilder, UserData, ValType};

use crate::plugin::contract::{
    HOST_EMIT_EVENT, HOST_FS_LIST_DIR, HOST_FS_READ_BYTES, HOST_FS_READ_TEXT, HOST_FS_WRITE_BYTES,
    HOST_IMPORT_READ_BYTES, HOST_LOG_FUNCTION, HOST_NOTIFY_FUNCTION, HOST_NOW_FUNCTION,
    HOST_OPEN_FILE, HOST_SQL_EXECUTE, HOST_SQL_QUERY, HOST_STATE_DELETE, HOST_STATE_READ,
    HOST_STATE_WRITE, HOST_STORE_INSPECT, HOST_STORE_INSTALL, HOST_STORE_INSTALLED,
    HOST_STORE_PLUGINS, HOST_STORE_SET_ENABLED, HOST_STORE_UNINSTALL, STORE_HOST_FUNCTIONS,
};
use crate::plugin::PluginManifest;

use super::super::host_state::RuntimeRoots;
use super::{fs, log, sql, state, store};

/// Регистрация host-функций, объявленных контрактом, в builder плагина.
///
/// Общие host-функции выдаются всегда; привилегированные host-функции стора —
/// только плагинам, объявившим их в `host_functions`.
pub(crate) fn register<'a>(
    mut builder: PluginBuilder<'a>,
    roots: &RuntimeRoots,
    manifest: &PluginManifest,
) -> PluginBuilder<'a> {
    let host_state = roots.host_state(&manifest.id);
    builder = builder
        .with_function(
            HOST_LOG_FUNCTION,
            [ValType::I64, ValType::I64, ValType::I64],
            [],
            UserData::new(host_state.clone()),
            log::host_log,
        )
        .with_function(
            HOST_NOTIFY_FUNCTION,
            [ValType::I64, ValType::I64, ValType::I64, ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            log::host_notify,
        )
        .with_function(
            HOST_FS_LIST_DIR,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            fs::host_fs_list_dir,
        )
        .with_function(
            HOST_FS_READ_TEXT,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            fs::host_fs_read_text,
        )
        .with_function(
            HOST_FS_READ_BYTES,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            fs::host_fs_read_bytes,
        )
        .with_function(
            HOST_IMPORT_READ_BYTES,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            fs::host_import_read_bytes,
        )
        .with_function(
            HOST_FS_WRITE_BYTES,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            fs::host_fs_write_bytes,
        )
        .with_function(
            HOST_OPEN_FILE,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            fs::host_open_file,
        )
        .with_function(
            HOST_STATE_READ,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            state::host_state_read,
        )
        .with_function(
            HOST_STATE_WRITE,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            state::host_state_write,
        )
        .with_function(
            HOST_STATE_DELETE,
            [ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            state::host_state_delete,
        )
        .with_function(
            HOST_NOW_FUNCTION,
            [],
            [ValType::I64],
            UserData::new(host_state.clone()),
            log::host_now_millis,
        )
        .with_function(
            HOST_EMIT_EVENT,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            log::host_emit_event,
        )
        .with_function(
            HOST_SQL_EXECUTE,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            sql::host_sql_execute,
        )
        .with_function(
            HOST_SQL_QUERY,
            [ValType::I64, ValType::I64],
            [ValType::I64],
            UserData::new(host_state.clone()),
            sql::host_sql_query,
        );

    for function in STORE_HOST_FUNCTIONS {
        if !declares_host_function(manifest, function) {
            continue;
        }
        builder = match *function {
            HOST_STORE_INSPECT => builder.with_function(
                HOST_STORE_INSPECT,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                store::host_store_inspect,
            ),
            HOST_STORE_INSTALL => builder.with_function(
                HOST_STORE_INSTALL,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                store::host_store_install,
            ),
            HOST_STORE_UNINSTALL => builder.with_function(
                HOST_STORE_UNINSTALL,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                store::host_store_uninstall,
            ),
            HOST_STORE_INSTALLED => builder.with_function(
                HOST_STORE_INSTALLED,
                [],
                [ValType::I64],
                UserData::new(host_state.clone()),
                store::host_store_installed,
            ),
            HOST_STORE_PLUGINS => builder.with_function(
                HOST_STORE_PLUGINS,
                [],
                [ValType::I64],
                UserData::new(host_state.clone()),
                store::host_store_plugins,
            ),
            HOST_STORE_SET_ENABLED => builder.with_function(
                HOST_STORE_SET_ENABLED,
                [ValType::I64, ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                store::host_store_set_enabled,
            ),
            _ => builder,
        };
    }

    builder
}

/// Признак, что манифест объявил host-функцию.
///
/// Привилегированные host-функции регистрируются только для плагинов,
/// объявивших их в `host_functions`.
pub(crate) fn declares_host_function(manifest: &PluginManifest, function: &str) -> bool {
    manifest
        .host_functions
        .iter()
        .any(|value| value == function)
}
