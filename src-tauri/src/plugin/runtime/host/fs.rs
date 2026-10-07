//! Host-функции файловой системы и безопасных путей.

use std::fs;
use std::io;
use std::path::Path;
use std::sync::Arc;

use extism::{CurrentPlugin, UserData, Val};

use super::super::host_state::{resolve_sandboxed, resolve_sandboxed_for_write, HostState};

/// Host-функция `fs_list_dir`: перечисление имён записей директории.
///
/// Путь из плагина трактуется как относительный к корню библиотеки. Выход за
/// пределы песочницы возвращается плагину ошибкой без раскрытия пути. Для
/// не-директории (файла) внутри песочницы возвращается пустой список, чтобы
/// плагин мог отличить файл от директории без перехвата ошибок вызова.
pub(super) fn host_fs_list_dir(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("не удалось захватить состояние host-функций плагина"))?;
    // Замок состояния снимается до файловых операций: резолв пути и чтение
    // каталога могут быть медленными, а блокировать общий runtime ими нельзя.
    let sandbox = Arc::clone(&state.roots.sandbox_root);
    drop(state);
    // Отсутствующий путь (например, битая символическая ссылка) трактуется как
    // пустая директория, чтобы единичная запись не обрушивала весь скан библиотеки.
    let path = match resolve_sandboxed(&sandbox, &relative) {
        Ok(path) => path,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return plugin
                .memory_set_val(&mut returns[0], "[]")
                .map_err(|err| extism::Error::msg(err.to_string()));
        }
        Err(_) => return Err(extism::Error::msg("путь вне песочницы библиотеки")),
    };
    let entries = read_directory_entries(&path);
    let payload = serde_json::to_string(&entries)
        .map_err(|_| extism::Error::msg("не удалось сериализовать список директории"))?;
    plugin
        .memory_set_val(&mut returns[0], &payload)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Запись директории для host-функции `fs_list_dir`.
#[derive(serde::Serialize)]
pub(crate) struct DirectoryEntry {
    /// Имя записи.
    pub(crate) name: String,
    /// Тип записи: `file`, `dir` или `symlink` (без следования по ссылке).
    pub(crate) kind: &'static str,
    /// Размер файла в байтах; `null` для каталогов, ссылок и при недоступности.
    pub(crate) size: Option<u64>,
    /// Время последнего изменения в миллисекундах Unix; `null` при недоступности.
    pub(crate) mtime_ms: Option<i64>,
}

/// Чтение записей директории, отсортированных по имени.
pub(crate) fn read_directory_entries(path: &Path) -> Vec<DirectoryEntry> {
    let mut entries = Vec::new();

    if let Ok(reader) = fs::read_dir(path) {
        for entry in reader.flatten() {
            let (kind, size, mtime_ms) = match entry.file_type() {
                Ok(file_type) if file_type.is_dir() => ("dir", None, None),
                Ok(file_type) if file_type.is_file() => {
                    let metadata = entry.metadata().ok();
                    let size = metadata.as_ref().map(|metadata| metadata.len());
                    let mtime_ms = metadata
                        .as_ref()
                        .and_then(|metadata| metadata.modified().ok())
                        .and_then(|modified| modified.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis() as i64);
                    ("file", size, mtime_ms)
                }
                _ => ("symlink", None, None),
            };
            entries.push(DirectoryEntry {
                name: entry.file_name().to_string_lossy().into_owned(),
                kind,
                size,
                mtime_ms,
            });
        }

        entries.sort_by(|left, right| left.name.cmp(&right.name));
    }

    entries
}

/// Host-функция `fs_read_text`: чтение содержимого файла как текста.
///
/// Путь из плагина трактуется как относительный к корню библиотеки. Выход за
/// пределы песочницы возвращается плагину ошибкой без раскрытия пути.
pub(super) fn host_fs_read_text(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("не удалось захватить состояние host-функций плагина"))?;
    let sandbox = Arc::clone(&state.roots.sandbox_root);
    drop(state);
    let path = resolve_sandboxed_for_write(&sandbox, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    let bytes = fs::read(&path).map_err(|_| extism::Error::msg("файл не читается"))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    plugin
        .memory_set_val(&mut returns[0], &text)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция чтения бинарного файла с возвратом base64.
pub(super) fn host_fs_read_bytes(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let sandbox = Arc::clone(&state.roots.sandbox_root);
    drop(state);
    let path = resolve_sandboxed(&sandbox, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    let bytes = fs::read(path).map_err(|_| extism::Error::msg("файл не читается"))?;
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    plugin
        .memory_set_val(&mut returns[0], &encoded)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция чтения файла, явно выбранного пользователем для импорта.
pub(super) fn host_import_read_bytes(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let path: String = plugin.memory_get_val(&args[0])?;
    let bytes =
        fs::read(Path::new(&path)).map_err(|_| extism::Error::msg("файл импорта не читается"))?;
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    plugin
        .memory_set_val(&mut returns[0], &encoded)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция записи файла внутри активного sandbox.
pub(super) fn host_fs_write_bytes(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let encoded: String = plugin.memory_get_val(&args[1])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let writable = *state
        .roots
        .sandbox_writable
        .lock()
        .map_err(|_| extism::Error::msg("режим записи sandbox недоступен"))?;
    if !writable {
        return Err(extism::Error::msg("запись в библиотеку запрещена"));
    }
    let sandbox = Arc::clone(&state.roots.sandbox_root);
    drop(state);
    let path = resolve_sandboxed(&sandbox, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, encoded)
        .map_err(|_| extism::Error::msg("некорректные данные файла"))?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|_| extism::Error::msg("каталог записи недоступен"))?;
    }
    fs::write(path, bytes).map_err(|_| extism::Error::msg("файл не записан"))?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция открытия безопасного относительного пути системным приложением.
pub(super) fn host_open_file(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let sandbox = Arc::clone(&state.roots.sandbox_root);
    drop(state);
    let path = resolve_sandboxed(&sandbox, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    open::that(path).map_err(|_| extism::Error::msg("файл не удалось открыть"))?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}
