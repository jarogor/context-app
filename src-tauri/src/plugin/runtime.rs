//! Host-runtime для плагинов.
//!
//! Сканирует папку `plugins/` портируемой директории, загружает плагины
//! в Extism runtime без WASI и без доступа к сети и предоставляет
//! host-функции, объявленные контрактом.

use std::fs;
use std::path::Path;

use extism::{Manifest, PluginBuilder, UserData, ValType, Wasm};

use crate::plugin::contract::{EXPORT_FUNCTION, HOST_LOG_FUNCTION, MANIFEST_FILE_NAME};
use crate::plugin::{HostSink, LoadedPlugin, PluginError, PluginManifest};

/// Плагинная подсистема приложения.
pub struct PluginRuntime {
    plugins: Vec<LoadedPlugin>,
    sink: HostSink,
}

impl PluginRuntime {
    /// Создание пустого runtime для внешней read-only библиотеки.
    pub fn empty() -> Self {
        Self {
            plugins: Vec::new(),
            sink: HostSink::new(),
        }
    }

    /// Загрузка всех плагинов из папки `plugins/`.
    ///
    /// Некорректные плагины отбраковываются с ошибкой: каждый плагин
    /// загружается независимо, поэтому сбой одного не влияет на остальные.
    pub fn load(plugins_dir: &Path) -> Result<Self, PluginError> {
        let sink = HostSink::new();
        let mut plugins = Vec::new();
        for entry in fs::read_dir(plugins_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }
            let dir = entry.path();
            match Self::load_plugin_dir(&dir, &sink) {
                Ok(plugin) => plugins.push(plugin),
                Err(err) => println!("[plugins] плагин {} пропущен: {err}", dir.display()),
            }
        }
        Ok(Self { plugins, sink })
    }

    /// Загрузка одного плагина из его директории.
    fn load_plugin_dir(dir: &Path, sink: &HostSink) -> Result<LoadedPlugin, PluginError> {
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

        let sink_for_host = sink.clone();
        let plugin = PluginBuilder::new(extism_manifest)
            .with_wasi(false)
            .with_function(
                HOST_LOG_FUNCTION,
                [ValType::I64],
                [],
                UserData::new(sink_for_host),
                host_log,
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
            function: manifest.export,
            plugin,
        })
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
    user_data: UserData<HostSink>,
) -> Result<(), extism::Error> {
    let message: String = plugin.memory_get_val(&args[0])?;
    let sink_handle = user_data.get()?;
    let sink = sink_handle
        .lock()
        .map_err(|_| extism::Error::msg("не удалось захватить приёмник сообщений плагина"))?;
    sink.push(&message);
    Ok(())
}

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
