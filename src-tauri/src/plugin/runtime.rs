//! Host-runtime для плагинов.
//!
//! Сканирует папки плагинов (библиотеки и поставляемые приложением), загружает
//! плагины в Extism runtime без WASI и без доступа к сети и предоставляет
//! host-функции, объявленные контрактом: `log`, а для source-плагинов — чтение
//! файловой системы в песочнице корня библиотеки.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use extism::{Manifest, PluginBuilder, UserData, ValType, Wasm};

use crate::plugin::contract::{
    EXPORT_FUNCTION, HOST_FS_LIST_DIR, HOST_FS_READ_TEXT, HOST_LOG_FUNCTION, MANIFEST_FILE_NAME,
};
use crate::plugin::{HostSink, LoadedPlugin, PluginError, PluginKind, PluginManifest};
use crate::sources::models::ExternalBook;

/// Плагинная подсистема приложения.
pub struct PluginRuntime {
    /// Загруженные плагины в порядке обнаружения.
    plugins: Vec<LoadedPlugin>,
    /// Приёмник сообщений плагинов.
    sink: HostSink,
    /// Песочный корень для host-функций файловой системы.
    sandbox_root: Arc<Mutex<PathBuf>>,
}

/// Состояние host-функций runtime: приёмник сообщений и песочный корень.
///
/// Root-поля разделяются через `Arc` между экземплярами host-функций и
/// runtime, чтобы смена корня библиотеки отражалась во всех вызовах.
#[derive(Clone)]
struct HostState {
    /// Песочный корень библиотеки, за пределы которого чтение запрещено.
    sandbox_root: Arc<Mutex<PathBuf>>,
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
                match Self::load_plugin_dir(&dir, &sink, &sandbox_root) {
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
        Ok(Self {
            plugins,
            sink,
            sandbox_root,
        })
    }

    /// Создание host-состояния для регистрации host-функций.
    fn host_state(sandbox_root: &Arc<Mutex<PathBuf>>, sink: &HostSink) -> HostState {
        HostState {
            sandbox_root: Arc::clone(sandbox_root),
            sink: sink.clone(),
        }
    }

    /// Загрузка одного плагина из его директории.
    fn load_plugin_dir(
        dir: &Path,
        sink: &HostSink,
        sandbox_root: &Arc<Mutex<PathBuf>>,
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

        let host_state = Self::host_state(sandbox_root, sink);
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
                UserData::new(host_state),
                host_fs_read_text,
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
            kind: manifest.kind,
            function: manifest.export,
            plugin,
        })
    }

    /// Установка песочного корня для host-функций файловой системы.
    pub fn set_sandbox_root(&mut self, root: PathBuf) {
        let mut current = self
            .sandbox_root
            .lock()
            .expect("не удалось захватить песочный корень runtime");
        *current = root;
    }

    /// Имена загруженных плагинов.
    pub fn plugin_names(&self) -> Vec<String> {
        self.plugins.iter().map(|p| p.name.clone()).collect()
    }

    /// Имена загруженных source-плагинов.
    pub fn source_names(&self) -> Vec<String> {
        self.plugins
            .iter()
            .filter(|plugin| plugin.kind == PluginKind::Source)
            .map(|plugin| plugin.name.clone())
            .collect()
    }

    /// Вызов экспортируемой функции загруженного плагина по имени.
    pub fn invoke(&mut self, name: &str, input: &str) -> Result<String, PluginError> {
        self.plugins
            .iter_mut()
            .find(|p| p.name == name)
            .ok_or_else(|| PluginError::UnknownPlugin(name.to_string()))?
            .invoke(input)
    }

    /// Опрос source-плагина о поддержке активного корня.
    pub(crate) fn probe(&mut self, name: &str) -> Result<bool, PluginError> {
        let output = self.invoke(name, r#"{"action":"probe"}"#)?;
        let value: serde_json::Value =
            serde_json::from_str(&output).map_err(|e| PluginError::Call {
                plugin: name.to_string(),
                message: e.to_string(),
            })?;
        value
            .get("supported")
            .and_then(|value| value.as_bool())
            .ok_or_else(|| PluginError::Call {
                plugin: name.to_string(),
                message: "ответ probe не содержит supported".to_string(),
            })
    }

    /// Полное сканирование внешнего источника source-плагином.
    pub(crate) fn scan(&mut self, name: &str) -> Result<Vec<ExternalBook>, PluginError> {
        let output = self.invoke(name, r#"{"action":"scan"}"#)?;
        let value: serde_json::Value =
            serde_json::from_str(&output).map_err(|e| PluginError::Call {
                plugin: name.to_string(),
                message: e.to_string(),
            })?;
        let books = value.get("books").ok_or_else(|| PluginError::Call {
            plugin: name.to_string(),
            message: "ответ scan не содержит books".to_string(),
        })?;
        serde_json::from_value(books.clone()).map_err(|e| PluginError::Call {
            plugin: name.to_string(),
            message: format!("некорректные книги источника: {e}"),
        })
    }

    /// Частичное пересканирование книги source-плагином.
    ///
    /// `path` — путь к папке книги относительно корня библиотеки.
    pub(crate) fn scan_book(
        &mut self,
        name: &str,
        path: &str,
    ) -> Result<Option<ExternalBook>, PluginError> {
        let request = serde_json::json!({ "action": "scan_book", "path": path });
        let output = self.invoke(name, &request.to_string())?;
        let value: serde_json::Value =
            serde_json::from_str(&output).map_err(|e| PluginError::Call {
                plugin: name.to_string(),
                message: e.to_string(),
            })?;
        let book = value.get("book").ok_or_else(|| PluginError::Call {
            plugin: name.to_string(),
            message: "ответ scan_book не содержит book".to_string(),
        })?;
        if book.is_null() {
            return Ok(None);
        }
        serde_json::from_value(book.clone()).map_err(|e| PluginError::Call {
            plugin: name.to_string(),
            message: format!("некорректная книга источника: {e}"),
        })
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
    let mut entries = Vec::new();
    if let Ok(reader) = fs::read_dir(&path) {
        for entry in reader.flatten() {
            entries.push(entry.file_name().to_string_lossy().into_owned());
        }
    }
    entries.sort();
    let payload = serde_json::to_string(&entries)
        .map_err(|_| extism::Error::msg("не удалось сериализовать список директории"))?;
    plugin
        .memory_set_val(&mut returns[0], &payload)
        .map_err(|err| extism::Error::msg(err.to_string()))
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
    let path = resolve_sandboxed(&state.sandbox_root, &relative)
        .map_err(|_| extism::Error::msg("путь вне песочницы библиотеки"))?;
    let bytes = fs::read(&path).map_err(|_| extism::Error::msg("файл не читается"))?;
    let text = String::from_utf8_lossy(&bytes).into_owned();
    plugin
        .memory_set_val(&mut returns[0], &text)
        .map_err(|err| extism::Error::msg(err.to_string()))
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

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
