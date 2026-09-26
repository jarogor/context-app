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
    EXPORT_FUNCTION, HOST_EMIT_EVENT, HOST_FS_LIST_DIR, HOST_FS_READ_BYTES, HOST_FS_READ_TEXT,
    HOST_FS_WRITE_BYTES, HOST_IMPORT_READ_BYTES, HOST_LOG_FUNCTION, HOST_NOTIFY_FUNCTION,
    HOST_NOW_FUNCTION, HOST_OPEN_FILE, HOST_STATE_DELETE, HOST_STATE_READ, HOST_STATE_WRITE,
    HOST_STORE_INSPECT, HOST_STORE_INSTALL, HOST_STORE_INSTALLED, HOST_STORE_PLUGINS,
    HOST_STORE_SET_ENABLED, HOST_STORE_UNINSTALL, MANIFEST_FILE_NAME, STORE_HOST_FUNCTIONS,
};
use crate::plugin::{
    activation, discovery, get_bus, package, LoadedPlugin, PluginError, PluginKind, PluginManifest,
    Severity,
};

/// Лимит длины поля трассировочного события в байтах.
const TRACE_FIELD_LIMIT: usize = 2048;

/// Плагинная подсистема приложения.
pub struct PluginRuntime {
    /// Загруженные плагины в порядке обнаружения.
    plugins: Vec<LoadedPlugin>,
    /// Песочный корень для host-функций файловой системы plugin-а.
    sandbox_root: Arc<Mutex<PathBuf>>,
    /// Корень служебного хранилища source-плагина.
    storage_root: Arc<Mutex<Option<PathBuf>>>,
    /// Корень пользовательского каталога плагинов для стора.
    plugin_store_root: Arc<Mutex<Option<PathBuf>>>,
    /// Корень реестра активности плагинов.
    activation_root: Arc<Mutex<Option<PathBuf>>>,
    /// Директории, по которым строится перечень плагинов стора.
    catalog_dirs: Arc<Mutex<Vec<PathBuf>>>,
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
    /// Корень пользовательского каталога плагинов для стора.
    plugin_store_root: Arc<Mutex<Option<PathBuf>>>,
    /// Корень реестра активности плагинов.
    activation_root: Arc<Mutex<Option<PathBuf>>>,
    /// Директории, из которых загружены плагины.
    catalog_dirs: Arc<Mutex<Vec<PathBuf>>>,
    /// Разрешена ли запись в sandbox.
    sandbox_writable: Arc<Mutex<bool>>,
}

impl PluginRuntime {
    /// Создание пустого runtime без песочницы.
    pub fn empty() -> Self {
        Self {
            plugins: Vec::new(),
            sandbox_root: Arc::new(Mutex::new(PathBuf::from("."))),
            storage_root: Arc::new(Mutex::new(None)),
            plugin_store_root: Arc::new(Mutex::new(None)),
            activation_root: Arc::new(Mutex::new(None)),
            catalog_dirs: Arc::new(Mutex::new(Vec::new())),
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
        Self::load_filtered(directories, sandbox_root, None, &[])
    }

    /// Загрузка плагинов выбранных категорий из указанных директорий.
    ///
    /// `kinds` ограничивает набор загружаемых категорий; `None` загружает все.
    /// Остальное поведение совпадает с [`PluginRuntime::load`].
    pub fn load_kinds(
        directories: &[PathBuf],
        sandbox_root: impl Into<PathBuf>,
        kinds: Option<&[PluginKind]>,
    ) -> Result<Self, PluginError> {
        Self::load_filtered(directories, sandbox_root, kinds, &[])
    }

    /// Загрузка плагинов с учётом отключённых.
    ///
    /// Отключённые плагины (кроме базовых каркаса) не загружаются.
    pub(crate) fn load_filtered(
        directories: &[PathBuf],
        sandbox_root: impl Into<PathBuf>,
        kinds: Option<&[PluginKind]>,
        disabled: &[String],
    ) -> Result<Self, PluginError> {
        let sandbox_root = Arc::new(Mutex::new(sandbox_root.into()));
        let storage_root = Arc::new(Mutex::new(None));
        let plugin_store_root = Arc::new(Mutex::new(None));
        let activation_root = Arc::new(Mutex::new(None));
        let catalog_dirs = Arc::new(Mutex::new(directories.to_vec()));
        let sandbox_writable = Arc::new(Mutex::new(false));
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
                    &sandbox_root,
                    &storage_root,
                    &plugin_store_root,
                    &activation_root,
                    &catalog_dirs,
                    &sandbox_writable,
                ) {
                    Ok(plugin) => {
                        if plugin.kind != PluginKind::Base
                            && disabled.iter().any(|id| id == &plugin.id)
                        {
                            continue;
                        }
                        if let Some(kinds) = kinds {
                            if !kinds.contains(&plugin.kind) {
                                continue;
                            }
                        }
                        // При загрузке из двух мест (plugins/ и ресурсы) один и тот
                        // же плагин не должен загружаться повторно.
                        if seen.insert(plugin.id.clone()) {
                            get_bus().publish_technical(
                                Severity::Info,
                                format!("Плагин загружен: {}", plugin.name),
                                "core",
                                serde_json::json!({
                                    "id": plugin.id,
                                    "name": plugin.name,
                                    "kind": plugin.kind,
                                }),
                            );
                            plugins.push(plugin);
                        }
                    }
                    Err(err) => {
                        get_bus().publish_technical(
                            Severity::Warn,
                            format!("Плагин пропущен: {err}"),
                            "core",
                            serde_json::json!({ "dir": dir.display().to_string() }),
                        );
                    }
                }
            }
        }
        Self::resolve_dependencies(&mut plugins)?;
        Ok(Self {
            plugins,
            sandbox_root,
            storage_root,
            plugin_store_root,
            activation_root,
            catalog_dirs,
            sandbox_writable,
        })
    }

    /// Создание host-состояния для регистрации host-функций.
    #[allow(clippy::too_many_arguments)]
    fn host_state(
        sandbox_root: &Arc<Mutex<PathBuf>>,
        storage_root: &Arc<Mutex<Option<PathBuf>>>,
        plugin_store_root: &Arc<Mutex<Option<PathBuf>>>,
        activation_root: &Arc<Mutex<Option<PathBuf>>>,
        catalog_dirs: &Arc<Mutex<Vec<PathBuf>>>,
        sandbox_writable: &Arc<Mutex<bool>>,
    ) -> HostState {
        HostState {
            sandbox_root: Arc::clone(sandbox_root),
            storage_root: Arc::clone(storage_root),
            plugin_store_root: Arc::clone(plugin_store_root),
            activation_root: Arc::clone(activation_root),
            catalog_dirs: Arc::clone(catalog_dirs),
            sandbox_writable: Arc::clone(sandbox_writable),
        }
    }

    /// Загрузка одного плагина из его директории.
    #[allow(clippy::too_many_arguments)]
    fn load_plugin_dir(
        dir: &Path,
        sandbox_root: &Arc<Mutex<PathBuf>>,
        storage_root: &Arc<Mutex<Option<PathBuf>>>,
        plugin_store_root: &Arc<Mutex<Option<PathBuf>>>,
        activation_root: &Arc<Mutex<Option<PathBuf>>>,
        catalog_dirs: &Arc<Mutex<Vec<PathBuf>>>,
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

        let host_state = Self::host_state(
            sandbox_root,
            storage_root,
            plugin_store_root,
            activation_root,
            catalog_dirs,
            sandbox_writable,
        );
        let mut builder = PluginBuilder::new(extism_manifest)
            .with_wasi(false)
            .with_function(
                HOST_LOG_FUNCTION,
                [ValType::I64, ValType::I64, ValType::I64],
                [],
                UserData::new(host_state.clone()),
                host_log,
            )
            .with_function(
                HOST_NOTIFY_FUNCTION,
                [ValType::I64, ValType::I64, ValType::I64, ValType::I64],
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
                UserData::new(host_state.clone()),
                host_state_delete,
            )
            .with_function(
                HOST_NOW_FUNCTION,
                [],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_now_millis,
            )
            .with_function(
                HOST_EMIT_EVENT,
                [ValType::I64, ValType::I64],
                [ValType::I64],
                UserData::new(host_state.clone()),
                host_emit_event,
            );

        for function in STORE_HOST_FUNCTIONS {
            if !declares_host_function(&manifest, function) {
                continue;
            }
            builder = match *function {
                HOST_STORE_INSPECT => builder.with_function(
                    HOST_STORE_INSPECT,
                    [ValType::I64],
                    [ValType::I64],
                    UserData::new(host_state.clone()),
                    host_store_inspect,
                ),
                HOST_STORE_INSTALL => builder.with_function(
                    HOST_STORE_INSTALL,
                    [ValType::I64],
                    [ValType::I64],
                    UserData::new(host_state.clone()),
                    host_store_install,
                ),
                HOST_STORE_UNINSTALL => builder.with_function(
                    HOST_STORE_UNINSTALL,
                    [ValType::I64],
                    [ValType::I64],
                    UserData::new(host_state.clone()),
                    host_store_uninstall,
                ),
                HOST_STORE_INSTALLED => builder.with_function(
                    HOST_STORE_INSTALLED,
                    [],
                    [ValType::I64],
                    UserData::new(host_state.clone()),
                    host_store_installed,
                ),
                HOST_STORE_PLUGINS => builder.with_function(
                    HOST_STORE_PLUGINS,
                    [],
                    [ValType::I64],
                    UserData::new(host_state.clone()),
                    host_store_plugins,
                ),
                HOST_STORE_SET_ENABLED => builder.with_function(
                    HOST_STORE_SET_ENABLED,
                    [ValType::I64, ValType::I64],
                    [ValType::I64],
                    UserData::new(host_state.clone()),
                    host_store_set_enabled,
                ),
                _ => builder,
            };
        }

        let plugin = builder.build().map_err(|e| PluginError::Build {
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
            id: manifest.id,
            name: manifest.name,
            kind: manifest.kind,
            provides: manifest.provides,
            requires: manifest.requires,
            settings: manifest.settings,
            function: manifest.export,
            plugin,
        })
    }

    /// Проверка и топологическая сортировка зависимостей плагинов.
    fn resolve_dependencies(plugins: &mut Vec<LoadedPlugin>) -> Result<(), PluginError> {
        let mut provided_by = std::collections::HashMap::new();
        for plugin in plugins.iter() {
            for capability in &plugin.provides {
                if let Some(previous) = provided_by.insert(capability.clone(), plugin.id.clone()) {
                    return Err(PluginError::Call {
                        plugin: plugin.id.clone(),
                        message: format!("capability {capability} уже предоставляется {previous}"),
                    });
                }
            }
        }
        for plugin in plugins.iter() {
            for capability in &plugin.requires {
                if !provided_by.contains_key(capability) {
                    return Err(PluginError::Dependency {
                        plugin: plugin.id.clone(),
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
                        .any(|plugin: &LoadedPlugin| &plugin.id == provider)
                });
                if ready {
                    ordered.push(remaining.remove(index));
                    progressed = true;
                } else {
                    index += 1;
                }
            }
            if !progressed {
                return Err(PluginError::DependencyCycle(remaining[0].id.clone()));
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

    /// Установка корня пользовательского каталога плагинов для стора.
    pub fn set_plugin_store_root(&mut self, root: PathBuf) {
        let mut current = self
            .plugin_store_root
            .lock()
            .expect("не удалось захватить корень стора плагинов");
        *current = Some(root);
    }

    /// Установка корня реестра активности плагинов.
    pub fn set_activation_root(&mut self, root: PathBuf) {
        let mut current = self
            .activation_root
            .lock()
            .expect("не удалось захватить корень реестра активности");
        *current = Some(root);
    }

    /// Установка директорий для перечня плагинов стора.
    pub fn set_catalog_dirs(&mut self, directories: Vec<PathBuf>) {
        let mut current = self
            .catalog_dirs
            .lock()
            .expect("не удалось захватить директории перечня плагинов");
        *current = directories;
    }

    /// Разрешение записи в активный plugin-корень.
    pub fn set_sandbox_writable(&mut self, writable: bool) {
        let mut state = self
            .sandbox_writable
            .lock()
            .expect("не удалось захватить режим записи sandbox");
        *state = writable;
    }

    /// Человекочитаемые имена загруженных плагинов.
    pub fn plugin_names(&self) -> Vec<String> {
        self.plugins.iter().map(|p| p.name.clone()).collect()
    }

    /// Человекочитаемое имя плагина по идентификатору.
    pub fn plugin_name(&self, id: &str) -> Option<String> {
        self.plugins
            .iter()
            .find(|plugin| plugin.id == id)
            .map(|plugin| plugin.name.clone())
    }

    /// Идентификаторы загруженных плагинов.
    pub fn plugin_ids(&self) -> Vec<String> {
        self.plugins.iter().map(|p| p.id.clone()).collect()
    }

    /// Идентификаторы загруженных source-плагинов.
    pub fn source_plugin_ids(&self) -> Vec<String> {
        self.plugins
            .iter()
            .filter(|plugin| plugin.kind == PluginKind::Source)
            .map(|plugin| plugin.id.clone())
            .collect()
    }

    /// Опрос source-плагина: приоритет поддержки корня или `None`.
    pub(crate) fn probe_priority(&mut self, id: &str) -> Result<Option<i32>, PluginError> {
        let output = self.invoke_operation(id, "probe", serde_json::json!({}))?;
        let value: serde_json::Value =
            serde_json::from_str(&output).map_err(|error| PluginError::Call {
                plugin: id.to_string(),
                message: error.to_string(),
            })?;
        let supported = value
            .get("supported")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        if !supported {
            return Ok(None);
        }
        let priority = value
            .get("priority")
            .and_then(|value| value.as_i64())
            .unwrap_or(0) as i32;
        Ok(Some(priority))
    }

    /// Вызов экспортируемой функции загруженного плагина по идентификатору.
    pub fn invoke(&mut self, id: &str, input: &str) -> Result<String, PluginError> {
        let started = std::time::Instant::now();
        let name = self.plugin_name(id).unwrap_or_else(|| id.to_string());
        let result = self.invoke_raw(id, input);
        self.trace_call(&name, "invoke", input, &result, started.elapsed());
        result
    }

    /// Непосредственный вызов плагина без трассировки.
    fn invoke_raw(&mut self, id: &str, input: &str) -> Result<String, PluginError> {
        self.plugins
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| PluginError::UnknownPlugin(id.to_string()))?
            .invoke(input)
    }

    /// Выполнение произвольной операции source-плагина без интерпретации payload ядром.
    pub(crate) fn invoke_operation(
        &mut self,
        id: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let mut request = serde_json::Map::new();
        request.insert(
            "action".to_string(),
            serde_json::Value::String(operation.to_string()),
        );
        request.insert("payload".to_string(), payload);
        let input = serde_json::Value::Object(request).to_string();
        let started = std::time::Instant::now();
        let name = self.plugin_name(id).unwrap_or_else(|| id.to_string());
        let result = self.invoke_raw(id, &input);
        self.trace_call(&name, operation, &input, &result, started.elapsed());
        result
    }

    /// Публикация трассировочного события вызова плагина.
    ///
    /// Payload и результат усекаются до лимита, чтобы не раздувать журнал.
    /// Ошибка вызова дополнительно публикуется со степенью `error`.
    fn trace_call(
        &self,
        name: &str,
        operation: &str,
        request: &str,
        result: &Result<String, PluginError>,
        elapsed: std::time::Duration,
    ) {
        let mut details = serde_json::json!({
            "plugin": name,
            "operation": operation,
            "duration_ms": elapsed.as_millis() as u64,
            "ok": result.is_ok(),
            "request": truncate(request, TRACE_FIELD_LIMIT),
        });
        match result {
            Ok(response) => {
                details["response"] =
                    serde_json::Value::String(truncate(response, TRACE_FIELD_LIMIT));
            }
            Err(error) => {
                details["error"] = serde_json::Value::String(error.to_string());
            }
        }
        get_bus().publish_technical(
            Severity::Trace,
            format!("Вызов {operation}: {name}"),
            "core",
            details,
        );
        if let Err(error) = result {
            get_bus().publish_technical(
                Severity::Error,
                format!("Вызов {operation} завершился ошибкой: {name}"),
                "core",
                serde_json::json!({
                    "plugin": name,
                    "operation": operation,
                    "error": error.to_string(),
                }),
            );
        }
    }

    /// Декларации настроек загруженных плагинов.
    ///
    /// Для каждого плагина с непустой декларацией возвращается источник
    /// `{ owner, kind, schema }`, пригодный для opaque-передачи базовому
    /// плагину настроек. Владельцем выступает идентификатор плагина.
    /// Содержимое схемы ядро не интерпретирует.
    pub(crate) fn settings_sources(&self) -> Vec<serde_json::Value> {
        self.plugins
            .iter()
            .filter_map(|plugin| {
                let schema = plugin.settings.as_ref()?;
                if schema.is_null() {
                    return None;
                }
                Some(serde_json::json!({
                    "owner": plugin.id,
                    "kind": plugin.kind,
                    "schema": schema,
                }))
            })
            .collect()
    }

    /// Идентификатор плагина, предоставляющего указанную capability.
    pub fn plugin_providing(&self, capability: &str) -> Option<String> {
        self.plugins
            .iter()
            .find(|plugin| plugin.provides.iter().any(|value| value == capability))
            .map(|plugin| plugin.id.clone())
    }

    /// Выполнение операции плагина, предоставляющего capability.
    ///
    /// Ядро маршрутизирует opaque-запрос провайдеру, не интерпретируя payload.
    pub(crate) fn invoke_capability(
        &mut self,
        capability: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let name = self
            .plugin_providing(capability)
            .ok_or_else(|| PluginError::MissingCapability(capability.to_string()))?;
        self.invoke_operation(&name, operation, payload)
    }
}

/// Усечение строки до лимита по границе символа.
fn truncate(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let mut end = limit;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}

/// Host-функция `log`: публикация технического сообщения плагина в bus.
///
/// Сигнатура: `log(severity, message, details)`.
fn host_log(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    _returns: &mut [extism::Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let severity_raw: String = plugin.memory_get_val(&args[0])?;
    let message: String = plugin.memory_get_val(&args[1])?;
    let details: String = plugin.memory_get_val(&args[2])?;
    let severity = Severity::parse(&severity_raw).unwrap_or_default();
    get_bus().publish_technical(severity, message, "plugin", parse_details(&details));
    Ok(())
}

/// Host-функция публикации уведомления, сформированного плагином.
///
/// Сигнатура: `notify(level, severity, message, details)`.
fn host_notify(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let level: String = plugin.memory_get_val(&args[0])?;
    let severity_raw: String = plugin.memory_get_val(&args[1])?;
    let message: String = plugin.memory_get_val(&args[2])?;
    let details: String = plugin.memory_get_val(&args[3])?;
    let severity = Severity::parse(&severity_raw).unwrap_or_default();
    let details = parse_details(&details);
    if level == "user" {
        get_bus().publish_user(severity, message, "plugin", details);
    } else {
        get_bus().publish_technical(severity, message, "plugin", details);
    }
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Разбор деталей события; некорректный JSON сохраняется как строка.
fn parse_details(details: &str) -> serde_json::Value {
    serde_json::from_str(details).unwrap_or_else(|_| {
        serde_json::json!({
            "raw": details,
        })
    })
}

/// Host-функция `emit_event`: эмиссия именованного прикладного события в Tauri.
///
/// Payload парсится как JSON; при ошибке парсинга передаётся строкой, чтобы
/// плагин не терял событие из-за некорректных данных.
fn host_emit_event(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let name: String = plugin.memory_get_val(&args[0])?;
    let payload: String = plugin.memory_get_val(&args[1])?;
    let payload = serde_json::from_str(&payload).unwrap_or(serde_json::Value::String(payload));
    crate::plugin::relay::emit(&name, payload);
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `now_millis`: текущее время Unix в миллисекундах.
///
/// Плагины не могут использовать системное время внутри `wasm32-unknown-unknown`,
/// поэтому получают его от приложения.
fn host_now_millis(
    plugin: &mut extism::CurrentPlugin,
    _args: &[extism::Val],
    returns: &mut [extism::Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default();
    plugin
        .memory_set_val(&mut returns[0], millis.to_string())
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

fn read_directory_entries(path: &Path) -> Vec<String> {
    let mut entries = Vec::new();

    if let Ok(reader) = fs::read_dir(path) {
        for entry in reader.flatten() {
            entries.push(entry.file_name().to_string_lossy().into_owned());
        }

        entries.sort();
    }

    entries
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

/// Признак, что манифест объявил host-функцию.
///
/// Привилегированные host-функции регистрируются только для плагинов,
/// объявивших их в `host_functions`.
fn declares_host_function(manifest: &PluginManifest, function: &str) -> bool {
    manifest
        .host_functions
        .iter()
        .any(|value| value == function)
}

/// Получение корня пользовательского каталога плагинов для host-функций стора.
fn store_root(state: &HostState) -> Result<PathBuf, extism::Error> {
    state
        .plugin_store_root
        .lock()
        .map_err(|_| extism::Error::msg("корень стора плагинов недоступен"))?
        .clone()
        .ok_or_else(|| extism::Error::msg("корень стора плагинов не настроен"))
}

/// Host-функция `store_inspect`: чтение манифеста из пакета без установки.
fn host_store_inspect(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
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
fn host_store_install(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
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
fn host_store_uninstall(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
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
fn host_store_installed(
    plugin: &mut extism::CurrentPlugin,
    _args: &[extism::Val],
    returns: &mut [extism::Val],
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
fn host_store_plugins(
    plugin: &mut extism::CurrentPlugin,
    _args: &[extism::Val],
    returns: &mut [extism::Val],
    user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let host = user_data.get()?;
    let state = host
        .lock()
        .map_err(|_| extism::Error::msg("состояние host недоступно"))?;
    let directories = state
        .catalog_dirs
        .lock()
        .map_err(|_| extism::Error::msg("директории плагинов недоступны"))?
        .clone();
    let user_root = state
        .plugin_store_root
        .lock()
        .map_err(|_| extism::Error::msg("корень стора недоступен"))?
        .clone();
    let activation_root = state
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
fn host_store_set_enabled(
    plugin: &mut extism::CurrentPlugin,
    args: &[extism::Val],
    returns: &mut [extism::Val],
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
        .catalog_dirs
        .lock()
        .map_err(|_| extism::Error::msg("директории плагинов недоступны"))?
        .clone();
    if !discovery::is_disableable(&directories, &id) {
        return Err(extism::Error::msg("плагин не отключаем или неизвестен"));
    }
    let root = state
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
