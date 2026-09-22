//! Host-runtime для плагинов.
//!
//! Сканирует папки плагинов, загружает
//! плагины в Extism runtime без WASI и без доступа к сети и предоставляет
//! host-функции, объявленные общим контрактом plugin-ов.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use extism::{Manifest, PluginBuilder, UserData, ValType, Wasm};

use crate::plugin::contract::{
    EXPORT_FUNCTION, HOST_FS_LIST_DIR, HOST_FS_READ_BYTES, HOST_FS_READ_TEXT, HOST_FS_WRITE_BYTES,
    HOST_IMPORT_READ_BYTES, HOST_LOG_FUNCTION, HOST_NOTIFY_FUNCTION, HOST_OPEN_FILE,
    HOST_STATE_DELETE, HOST_STATE_READ, HOST_STATE_WRITE, MANIFEST_FILE_NAME,
};
use crate::plugin::{HostSink, LoadedPlugin, PluginError, PluginManifest};

/// Плагинная подсистема приложения.
pub struct PluginRuntime {
    /// Загруженные плагины в порядке обнаружения.
    plugins: Vec<LoadedPlugin>,
    /// Приёмник сообщений плагинов.
    sink: HostSink,
    /// Песочный корень для host-функций файловой системы plugin-а.
    sandbox_root: Arc<Mutex<PathBuf>>,
    /// Корень служебного хранилища source-плагина.
    storage_root: Arc<Mutex<Option<PathBuf>>>,
    /// Разрешена ли запись в sandbox.
    sandbox_writable: Arc<Mutex<bool>>,
}

/// Состояние host-функций runtime: приёмник сообщений и песочный корень.
///
/// Root-поля разделяются через `Arc` между экземплярами host-функций и
/// runtime, чтобы смена корня отражалась во всех вызовах.
#[derive(Clone)]
struct HostState {
    /// Песочный корень plugin-а, за пределы которого чтение запрещено.
    sandbox_root: Arc<Mutex<PathBuf>>,
    /// Корень служебного хранилища plugin-а.
    storage_root: Arc<Mutex<Option<PathBuf>>>,
    /// Разрешена ли запись в sandbox.
    sandbox_writable: Arc<Mutex<bool>>,
    /// Приёмник сообщений плагинов.
    sink: HostSink,
}

impl PluginRuntime {
    /// Создание пустого runtime без песочницы.
    pub fn empty() -> Self {
        Self {
            plugins: Vec::new(),
            sink: HostSink::new(),
            sandbox_root: Arc::new(Mutex::new(PathBuf::from("."))),
            storage_root: Arc::new(Mutex::new(None)),
            sandbox_writable: Arc::new(Mutex::new(false)),
        }
    }

    /// Загрузка всех плагинов из указанных директорий.
    ///
    /// Некорректные плагины отбраковываются с ошибкой: каждый плагин
    /// загружается независимо, поэтому сбой одного не влияет на остальные.
    /// Отсутствующие директории пропускаются, чтобы внешняя библиотека без
    /// собственной папки `plugins/` могла использовать поставляемые плагины.
    ///
    /// `sandbox_root` — корень, за пределы которого source-плагинам запрещено
    /// читать файловую систему.
    pub fn load(
        directories: &[PathBuf],
        sandbox_root: impl Into<PathBuf>,
    ) -> Result<Self, PluginError> {
        let sandbox_root = Arc::new(Mutex::new(sandbox_root.into()));
        let storage_root = Arc::new(Mutex::new(None));
        let sandbox_writable = Arc::new(Mutex::new(false));
        let sink = HostSink::new();
        let mut plugins = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for directory in directories {
            let Ok(entries) = fs::read_dir(directory) else {
                continue;
            };
            for entry in entries {
                let entry = entry?;
                if !entry.file_type()?.is_dir() {
                    continue;
                }
                let dir = entry.path();
                match Self::load_plugin_dir(
                    &dir,
                    &sink,
                    &sandbox_root,
                    &storage_root,
                    &sandbox_writable,
                ) {
                    Ok(plugin) => {
                        // При загрузке из двух мест (plugins/ и ресурсы) один и тот
                        // же плагин не должен загружаться повторно.
                        if seen.insert(plugin.name.clone()) {
                            plugins.push(plugin);
                        }
                    }
                    Err(err) => println!("[plugins] плагин {} пропущен: {err}", dir.display()),
                }
            }
        }
        Self::resolve_dependencies(&mut plugins)?;
        Ok(Self {
            plugins,
            sink,
            sandbox_root,
            storage_root,
            sandbox_writable,
        })
    }

    /// Создание host-состояния для регистрации host-функций.
    fn host_state(
        sandbox_root: &Arc<Mutex<PathBuf>>,
        storage_root: &Arc<Mutex<Option<PathBuf>>>,
        sandbox_writable: &Arc<Mutex<bool>>,
        sink: &HostSink,
    ) -> HostState {
        HostState {
            sandbox_root: Arc::clone(sandbox_root),
            storage_root: Arc::clone(storage_root),
            sandbox_writable: Arc::clone(sandbox_writable),
            sink: sink.clone(),
        }
    }

    /// Загрузка одного плагина из его директории.
    fn load_plugin_dir(
        dir: &Path,
        sink: &HostSink,
        sandbox_root: &Arc<Mutex<PathBuf>>,
        storage_root: &Arc<Mutex<Option<PathBuf>>>,
        sandbox_writable: &Arc<Mutex<bool>>,
    ) -> Result<LoadedPlugin, PluginError> {
        let manifest = PluginManifest::load(&dir.join(MANIFEST_FILE_NAME)).map_err(|e| {
            PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: match e {
                    PluginError::InvalidManifest { reason, .. } => reason,
                    other => other.to_string(),
                },
            }
        })?;
        manifest.validate(dir)?;

        if manifest.export != EXPORT_FUNCTION {
            return Err(PluginError::MissingExport {
                dir: dir.to_path_buf(),
                function: EXPORT_FUNCTION.to_string(),
            });
        }

        let wasm_path = dir.join(&manifest.module);
        if !wasm_path.exists() {
            return Err(PluginError::ModuleNotFound {
                dir: dir.to_path_buf(),
                module: manifest.module.clone(),
            });
        }

        let extism_manifest = Manifest::new([Wasm::file(&wasm_path)]).disallow_all_hosts();

        let host_state = Self::host_state(sandbox_root, storage_root, sandbox_writable, sink);
        let plugin = PluginBuilder::new(extism_manifest)
            .with_wasi(false)
            .with_function(
                HOST_LOG_FUNCTION,
                [ValType::I64],
                [],
                UserData::new(host_state.clone()),
                host_log,
            )
            .with_function(
                HOST_NOTIFY_FUNCTION,
                [ValType::I64, ValType::I64, ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_notify,
            )
            .with_function(
                HOST_FS_LIST_DIR,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_fs_list_dir,
            )
            .with_function(
                HOST_FS_READ_TEXT,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_fs_read_text,
            )
            .with_function(
                HOST_FS_READ_BYTES,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_fs_read_bytes,
            )
            .with_function(
                HOST_IMPORT_READ_BYTES,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_import_read_bytes,
            )
            .with_function(
                HOST_FS_WRITE_BYTES,
                [ValType::I64, ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_fs_write_bytes,
            )
            .with_function(
                HOST_OPEN_FILE,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_open_file,
            )
            .with_function(
                HOST_STATE_READ,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_state_read,
            )
            .with_function(
                HOST_STATE_WRITE,
                [ValType::I64, ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_state_write,
            )
            .with_function(
                HOST_STATE_DELETE,
                [ValType::I64],
                [ValType::I64],
                UserData::new(host_state),
                host_state_delete,
            )
            .build()
            .map_err(|e| PluginError::Build {
                dir: dir.to_path_buf(),
                message: e.to_string(),
            })?;

        if !plugin.function_exists(&manifest.export) {
            return Err(PluginError::MissingExport {
                dir: dir.to_path_buf(),
                function: manifest.export,
            });
        }

        Ok(LoadedPlugin {
            name: manifest.name,
            provides: manifest.provides,
            requires: manifest.requires,
            function: manifest.export,
            plugin,
        })
    }

    /// Проверка и топологическая сортировка зависимостей плагинов.
    fn resolve_dependencies(plugins: &mut Vec<LoadedPlugin>) -> Result<(), PluginError> {
        let mut provided_by = std::collections::HashMap::new();
        for plugin in plugins.iter() {
            for capability in &plugin.provides {
                if let Some(previous) = provided_by.insert(capability.clone(), plugin.name.clone())
                {
                    return Err(PluginError::Call {
                        plugin: plugin.name.clone(),
                        message: format!("capability {capability} уже предоставляется {previous}"),
                    });
                }
            }
        }
        for plugin in plugins.iter() {
            for capability in &plugin.requires {
                if !provided_by.contains_key(capability) {
                    return Err(PluginError::Dependency {
                        plugin: plugin.name.clone(),
                        capability: capability.clone(),
                    });
                }
            }
        }
        let mut ordered = Vec::with_capacity(plugins.len());
        let mut remaining = std::mem::take(plugins);
        while !remaining.is_empty() {
            let mut progressed = false;
            let mut index = 0;
            while index < remaining.len() {
                let ready = remaining[index].requires.iter().all(|required| {
                    let Some(provider) = provided_by.get(required) else {
                        return false;
                    };
                    ordered
                        .iter()
                        .any(|plugin: &LoadedPlugin| &plugin.name == provider)
                });
                if ready {
                    ordered.push(remaining.remove(index));
                    progressed = true;
                } else {
                    index += 1;
                }
            }
            if !progressed {
                return Err(PluginError::DependencyCycle(remaining[0].name.clone()));
            }
        }
        *plugins = ordered;
        Ok(())
    }

    /// Установка source-корня для host-функций файловой системы.
    pub fn set_sandbox_root(&mut self, root: PathBuf) {
        let mut current = self
            .sandbox_root
            .lock()
            .expect("не удалось захватить песочный корень runtime");
        *current = root;
    }

    /// Установка отдельного корня служебного хранилища source-плагинов.
    pub fn set_storage_root(&mut self, root: PathBuf) {
        let mut current = self
            .storage_root
            .lock()
            .expect("не удалось захватить корень storage runtime");
        *current = Some(root);
    }

    /// Разрешение записи в активный plugin-корень.
    pub fn set_sandbox_writable(&mut self, writable: bool) {
        let mut state = self
            .sandbox_writable
            .lock()
            .expect("не удалось захватить режим записи sandbox");
        *state = writable;
    }

    /// Имена загруженных плагинов.
    pub fn plugin_names(&self) -> Vec<String> {
        self.plugins.iter().map(|p| p.name.clone()).collect()
    }

    /// Вызов экспортируемой функции загруженного плагина по имени.
    pub fn invoke(&mut self, name: &str, input: &str) -> Result<String, PluginError> {
        self.plugins
            .iter_mut()
            .find(|p| p.name == name)
            .ok_or_else(|| PluginError::UnknownPlugin(name.to_string()))?
            .invoke(input)
    }

    /// Выполнение произвольной операции source-плагина без интерпретации payload ядром.
    pub(crate) fn invoke_operation(
        &mut self,
        name: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let mut request = serde_json::Map::new();
        request.insert(
            "action".to_string(),
            serde_json::Value::String(operation.to_string()),
        );
        request.insert("payload".to_string(), payload);
        self.invoke(name, &serde_json::Value::Object(request).to_string())
    }

    /// Сообщения, полученные от плагинов через host-функцию `log`.
    pub fn logs(&self) -> Vec<String> {
        self.sink.drain()
    }
}

/// Host-функция `log`: получение строки из памяти плагина
/// и сохранение её в приёмнике сообщений.
fn host_log(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    _returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let message: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("не удалось захватить состояние host-функций плагина"))?;
    state.sink.push(&message);
    Ok(())
}

/// Host-функция публикации уведомления, сформированного плагином.
fn host_notify(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let level: String = plugin.memory_get_val(&args[0])?;
    let message: String = plugin.memory_get_val(&args[1])?;
    let details: String = plugin.memory_get_val(&args[2])?;
    let details = serde_json::from_str(&details).unwrap_or_else(|_| {
        serde_json::json!({
            "raw": details,
        })
    });
    let journal = crate::journal::get_journal_handle();
    if level == "user" {
        journal.add_user(message, crate::journal::Severity::Info, "plugin", details);
    } else {
        journal.add_technical(message, "plugin", details);
    }
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `fs_list_dir`: перечисление имён записей директории.
///
/// Путь из плагина трактуется как относительный к корню библиотеки. Выход за
/// пределы песочницы возвращается плагину ошибкой без раскрытия пути. Для
/// не-директории (файла) внутри песочницы возвращается пустой список, чтобы
/// плагин мог отличить файл от директории без перехвата ошибок вызова.
fn host_fs_list_dir(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("не удалось захватить состояние host-функций плагина"))?;
    // Отсутствующий путь (например, битая символическая ссылка) трактуется как
    // пустая директория, чтобы единичная запись не обрушивала весь скан библиотеки.
    let path = match resolve_sandboxed(&state.sandbox_root, &relative) {
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

fn read_directory_entries(path: &PathBuf) -> Vec<String> {
    let mut entries = Vec::new();

    if let Ok(reader) = fs::read_dir(&path) {
        for entry in reader.flatten() {
            entries.push(entry.file_name().to_string_lossy().into_owned());
        }

        entries.sort();
    }

    return entries;
}

/// Host-функция `fs_read_text`: чтение содержимого файла как текста.
///
/// Путь из плагина трактуется как относительный к корню библиотеки. Выход за
/// пределы песочницы возвращается плагину ошибкой без раскрытия пути.
fn host_fs_read_text(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("не удалось захватить состояние host-функций плагина"))?;
    let path = resolve_sandboxed_for_write(&state.sandbox_root, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    let bytes = fs::read(&path).map_err(|_| extism::Error::msg("файл не читается"))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    plugin
        .memory_set_val(&mut returns[0], &text)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция чтения бинарного файла с возвратом base64.
fn host_fs_read_bytes(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let path = resolve_sandboxed(&state.sandbox_root, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    let bytes = fs::read(path).map_err(|_| extism::Error::msg("файл не читается"))?;
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    plugin
        .memory_set_val(&mut returns[0], &encoded)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция чтения файла, явно выбранного пользователем для импорта.
fn host_import_read_bytes(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
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
fn host_fs_write_bytes(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let encoded: String = plugin.memory_get_val(&args[1])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let writable = *state
        .sandbox_writable
        .lock()
        .map_err(|_| extism::Error::msg("режим записи sandbox недоступен"))?;
    if !writable {
        return Err(extism::Error::msg("запись в библиотеку запрещена"));
    }
    let path = resolve_sandboxed(&state.sandbox_root, &relative)
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
fn host_open_file(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let relative: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let path = resolve_sandboxed(&state.sandbox_root, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    open::that(path).map_err(|_| extism::Error::msg("файл не удалось открыть"))?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Чтение служебного состояния по безопасному ключу.
fn host_state_read(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let key: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?;
    let path = resolve_storage_key(&state.storage_root, &key)
        .map_err(|_| extism::Error::msg("служебное состояние недоступно"))?;
    let value = fs::read_to_string(path).unwrap_or_default();
    plugin
        .memory_set_val(&mut returns[0], &value)
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Атомарная запись служебного состояния по безопасному ключу.
fn host_state_write(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let key: String = plugin.memory_get_val(&args[0])?;
    let value: String = plugin.memory_get_val(&args[1])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?;
    let path = resolve_storage_key(&state.storage_root, &key)
        .map_err(|_| extism::Error::msg("служебное состояние недоступно"))?;
    let root = state
        .storage_root
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?
        .clone()
        .ok_or_else(|| extism::Error::msg("служебное хранилище не настроено"))?;
    fs::create_dir_all(&root).map_err(|err| extism::Error::msg(err.to_string()))?;
    let temporary = path.with_extension("tmp");
    fs::write(&temporary, value).map_err(|err| extism::Error::msg(err.to_string()))?;
    fs::rename(&temporary, &path).map_err(|err| extism::Error::msg(err.to_string()))?;
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Удаление служебного состояния по безопасному ключу.
fn host_state_delete(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let key: String = plugin.memory_get_val(&args[0])?;
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("служебное хранилище недоступно"))?;
    let path = resolve_storage_key(&state.storage_root, &key)
        .map_err(|_| extism::Error::msg("служебное состояние недоступно"))?;
    match fs::remove_file(path) {
        Ok(()) => {}
        Err(error) if error.kind() == io::ErrorKind::NotFound => {}
        Err(error) => return Err(extism::Error::msg(error.to_string())),
    }
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Разрешение ключа storage внутри отдельного корня состояния.
fn resolve_storage_key(root: &Arc<Mutex<Option<PathBuf>>>, key: &str) -> io::Result<PathBuf> {
    if key.is_empty()
        || key == "."
        || key == ".."
        || key.contains('/')
        || key.contains('\\')
        || Path::new(key).is_absolute()
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "некорректный ключ storage",
        ));
    }
    let root = root
        .lock()
        .map_err(|_| io::Error::other("служебное хранилище недоступно"))?
        .clone()
        .ok_or_else(|| io::Error::new(io::ErrorKind::PermissionDenied, "storage не настроен"))?;
    Ok(root.join(key))
}

/// Разрешение относительного пути внутри песочного корня.
///
/// Возвращает канонический путь кандидата только если он лежит строго внутри
/// канонизированного корня. Ошибка не содержит пути, чтобы не раскрывать
/// структуру файловой системы за пределами песочницы.
fn resolve_sandboxed(root: &Arc<Mutex<PathBuf>>, relative: &str) -> io::Result<PathBuf> {
    let root = root
        .lock()
        .map_err(|_| io::Error::other("песочный корень недоступен"))?;
    let root_path = root.canonicalize().map_err(|error| {
        io::Error::new(
            io::ErrorKind::PermissionDenied,
            format!("корень недоступен: {error}"),
        )
    })?;
    let candidate = root_path.join(relative).canonicalize().map_err(|error| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("путь не существует: {error}"),
        )
    })?;
    if !candidate.starts_with(&root_path) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "путь вне песочницы",
        ));
    }
    Ok(candidate)
}

/// Разрешение пути записи внутри sandbox, включая новый файл.
fn resolve_sandboxed_for_write(root: &Arc<Mutex<PathBuf>>, relative: &str) -> io::Result<PathBuf> {
    if relative.is_empty()
        || Path::new(relative).is_absolute()
        || Path::new(relative)
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "путь вне песочницы",
        ));
    }
    let root_path = root
        .lock()
        .map_err(|_| io::Error::other("песочный корень недоступен"))?
        .canonicalize()?;
    let candidate = root_path.join(relative);
    let parent = candidate
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::PermissionDenied, "путь вне песочницы"))?
        .canonicalize()?;
    if !parent.starts_with(&root_path) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "путь вне песочницы",
        ));
    }
    Ok(candidate)
}

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
