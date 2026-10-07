//! Host-функции служебного хранилища плагина.

use std::fs;

use extism::{CurrentPlugin, UserData, Val};

use super::super::host_state::{resolve_storage_key, HostState};

/// Чтение служебного состояния по безопасному ключу.
pub(super) fn host_state_read(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let key: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?;
    let path = resolve_storage_key(&state, &key)
        .map_err(|_| extism::Error::msg("служебное состояние недоступно"))?;
    drop(state);
    let value = crate::atomic_file::read_text_or_default(&path);
    plugin
        .memory_set_val(&mut returns[0], &value)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Атомарная запись служебного состояния по безопасному ключу.
pub(super) fn host_state_write(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let key: String = plugin.memory_get_val(&args[0])?;
    let value: String = plugin.memory_get_val(&args[1])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?;
    let path = resolve_storage_key(&state, &key)
        .map_err(|_| extism::Error::msg("служебное состояние недоступно"))?;
    let root = state.storage_root().map_err(extism::Error::msg)?;
    drop(state);
    fs::create_dir_all(&root).map_err(|err| extism::Error::msg(err.to_string()))?;
    crate::atomic_file::atomic_write(&path, value.as_bytes())
        .map_err(|err| extism::Error::msg(err.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Удаление служебного состояния по безопасному ключу.
pub(super) fn host_state_delete(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let key: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?;
    let path = resolve_storage_key(&state, &key)
        .map_err(|_| extism::Error::msg("служебное состояние недоступно"))?;
    drop(state);
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => return Err(extism::Error::msg(error.to_string())),
    }
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}
