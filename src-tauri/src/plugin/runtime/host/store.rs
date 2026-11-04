//! Host-функции стора плагинов.

use std::fs;
use std::path::{Path, PathBuf};

use extism::{CurrentPlugin, UserData, Val};

use crate::plugin::{activation, discovery, get_bus, package, Severity};
use crate::update::{package as update_package, source, UpdateSource};

use super::super::host_state::HostState;

/// Максимальный размер индекса стора.
const MAX_INDEX_BYTES: usize = 2 * 1024 * 1024;

/// Максимальный размер скачиваемого пакета плагина.
const MAX_PACKAGE_BYTES: u64 = 512 * 1024 * 1024;

/// Имя служебного каталога загрузок внутри каталога стора.
const DOWNLOADS_DIR_NAME: &str = ".downloads";

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

/// Host-функция `store_read`: чтение текстового файла стора.
///
/// Файловый вид читает файл из каталога стора, сетевой — запрашивает адрес.
/// Источник описывается теми же полями, что и подключённый стор.
///
/// Ошибка чтения **возвращается плагину текстом**, а не обрывает вызов: у
/// Extism ошибка host-функции завершает весь вызов плагина, и одна недоступная
/// запись (например, стор без индекса) роняла всё действие `updates` с
/// backtrace wasm вместо понятного сообщения. Пустая строка означает «файла
/// нет» — плагин превращает это в свой отказ и продолжает остальные сторы.
pub(super) fn host_store_read(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let kind: String = plugin.memory_get_val(&args[0])?;
    let location: String = plugin.memory_get_val(&args[1])?;
    let relative: String = plugin.memory_get_val(&args[2])?;
    let source = UpdateSource { kind, location };
    let text = match source::read_text(&source, &relative, MAX_INDEX_BYTES) {
        Ok(text) => text,
        Err(error) => {
            // Отказ публикуется в журнал: без него непонятно, почему стор пуст.
            get_bus().publish(
                Severity::Debug,
                format!("Стор не читается ({relative}): {error}"),
                "core",
                serde_json::json!({ "relative": relative }),
            );
            String::new()
        }
    };
    plugin
        .memory_set_val(&mut returns[0], &text)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `store_fetch`: загрузка пакета плагина из стора.
///
/// Файл попадает в служебный каталог загрузок и проверяется по контрольной
/// сумме. Для сетевого стора сумма обязательна. Возвращается абсолютный путь,
/// который затем передаётся в `store_install`.
pub(super) fn host_store_fetch(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let kind: String = plugin.memory_get_val(&args[0])?;
    let location: String = plugin.memory_get_val(&args[1])?;
    let relative: String = plugin.memory_get_val(&args[2])?;
    let sha256: String = plugin.memory_get_val(&args[3])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let root = store_root(&state)?;
    drop(state);
    let downloads = root.join(DOWNLOADS_DIR_NAME);
    fs::create_dir_all(&downloads)
        .map_err(|_| extism::Error::msg("каталог загрузок недоступен"))?;
    let name = sanitize_file_name(&relative);
    let destination = downloads.join(name);
    let source = UpdateSource {
        kind: kind.clone(),
        location,
    };
    source::download(&source, &relative, &destination, MAX_PACKAGE_BYTES)
        .map_err(extism::Error::msg)?;
    let expected = sha256.trim();
    update_package::verify_sha256(
        &destination,
        (!expected.is_empty()).then_some(expected),
        kind == "network",
    )
    .map_err(extism::Error::msg)?;
    let path = destination.to_string_lossy().into_owned();
    plugin
        .memory_set_val(&mut returns[0], &path)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Безопасное имя файла загрузки из относительного пути пакета.
fn sanitize_file_name(relative: &str) -> String {
    relative
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '.' | '-' | '_') {
                value
            } else {
                '_'
            }
        })
        .collect()
}
