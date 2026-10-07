//! Host-функции стора плагинов.

use std::path::{Path, PathBuf};

use extism::{CurrentPlugin, UserData, Val};

use crate::plugin::{activation, discovery, package};

use super::super::host_state::HostState;

/// Получение корня пользовательского каталога плагинов для host-функций стора.
pub(crate) fn store_root(state: &HostState) -> Result<PathBuf, extism::Error> {
    state.store_root()
}

/// Host-функция `store_inspect`: чтение манифеста из пакета без установки.
pub(super) fn host_store_inspect(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let path: String = plugin.memory_get_val(&args[0])?;
    let manifest = package::inspect_package(Path::new(&path))
        .map_err(|error| extism::Error::msg(error.to_string()))?;
    let value = serde_json::to_string(&package::InstalledPlugin::from(&manifest))
        .map_err(|error| extism::Error::msg(error.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], &value)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `store_install`: установка пакета в пользовательский каталог.
pub(super) fn host_store_install(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let path: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let root = store_root(&state)?;
    let installed = package::install_package(Path::new(&path), &root)
        .map_err(|error| extism::Error::msg(error.to_string()))?;
    let value =
        serde_json::to_string(&installed).map_err(|error| extism::Error::msg(error.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], &value)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `store_uninstall`: удаление установленного плагина по
/// идентификатору.
pub(super) fn host_store_uninstall(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let id: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let root = store_root(&state)?;
    package::uninstall_package(&id, &root)
        .map_err(|error| extism::Error::msg(error.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `store_installed`: список установленных плагинов.
pub(super) fn host_store_installed(
    plugin: &mut CurrentPlugin,
    _args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let root = store_root(&state)?;
    let list =
        package::installed_plugins(&root).map_err(|error| extism::Error::msg(error.to_string()))?;
    let value =
        serde_json::to_string(&list).map_err(|error| extism::Error::msg(error.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], &value)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `store_plugins`: перечень отключаемых плагинов.
pub(super) fn host_store_plugins(
    plugin: &mut CurrentPlugin,
    _args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let directories = state
        .roots
        .catalog_dirs
        .lock()
        .map_err(|_| extism::Error::msg("директории плагинов недоступны"))?
        .clone();
    let user_root = state
        .roots
        .plugin_store_root
        .lock()
        .map_err(|_| extism::Error::msg("корень стора недоступен"))?
        .clone();
    let activation_root = state
        .roots
        .activation_root
        .lock()
        .map_err(|_| extism::Error::msg("корень реестра активности недоступен"))?
        .clone();
    let disabled = match activation_root {
        Some(root) => activation::load(&root).map_err(extism::Error::msg)?,
        None => Vec::new(),
    };
    let entries = discovery::list_disableable(&directories, user_root.as_deref(), &disabled);
    let value =
        serde_json::to_string(&entries).map_err(|error| extism::Error::msg(error.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], &value)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `store_set_enabled`: переключение активности плагина по
/// идентификатору.
pub(super) fn host_store_set_enabled(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let id: String = plugin.memory_get_val(&args[0])?;
    let enabled_raw: String = plugin.memory_get_val(&args[1])?;
    let enabled = enabled_raw == "true";
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let directories = state
        .roots
        .catalog_dirs
        .lock()
        .map_err(|_| extism::Error::msg("директории плагинов недоступны"))?
        .clone();
    if !discovery::is_disableable(&directories, &id) {
        return Err(extism::Error::msg("плагин не отключаем или неизвестен"));
    }
    let root = state
        .roots
        .activation_root
        .lock()
        .map_err(|_| extism::Error::msg("корень реестра активности недоступен"))?
        .clone()
        .ok_or_else(|| extism::Error::msg("реестр активности не настроен"))?;
    activation::set_enabled(&root, &id, enabled).map_err(extism::Error::msg)?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}
