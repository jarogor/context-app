//! Host-runtime для плагинов.
//!
//! Сканирует папку `plugins/` портируемой директории, загружает плагины
//! в Extism runtime без WASI и без доступа к сети и предоставляет
//! host-функции, объявленные контрактом.

use std::fs;
use std::sync::{Arc, Mutex};
use std::path::Path;

use extism::{Manifest, Plugin, PluginBuilder, UserData, ValType, Wasm};

use crate::plugin::contract::{
  EXPORT_FUNCTION, HOST_LOG_FUNCTION, MANIFEST_FILE_NAME, PluginManifest,
};
use crate::plugin::PluginError;

/// Приёмник сообщений плагинов, приходящих через host-функцию `log`.
#[derive(Clone, Default)]
pub struct HostSink {
  inner: Arc<Mutex<Vec<String>>>,
}

impl HostSink {
  /// Создание нового приёмника сообщений.
  pub fn new() -> Self {
    Self::default()
  }

  /// Сохранение сообщения, полученного от плагина.
  pub fn push(&self, message: &str) {
    if let Ok(mut logs) = self.inner.lock() {
      logs.push(message.to_string());
    }
  }

  /// Получение всех сохранённых сообщений.
  pub fn drain(&self) -> Vec<String> {
    self
      .inner
      .lock()
      .map(|mut logs| std::mem::take(&mut *logs))
      .unwrap_or_default()
  }
}

/// Загруженный плагин, готовый к вызову.
pub struct LoadedPlugin {
  /// Имя плагина из манифеста.
  pub name: String,
  /// Имя экспортируемой функции.
  pub function: String,
  /// Инстанс плагина в Extism runtime.
  plugin: Plugin,
}

impl LoadedPlugin {
  /// Вызов экспортируемой функции плагина.
  pub fn invoke(&mut self, input: &str) -> Result<String, PluginError> {
    let output: String = self
      .plugin
      .call::<&str, String>(&self.function, input)
      .map_err(|e| PluginError::Call {
        plugin: self.name.clone(),
        message: e.to_string(),
      })?;
    Ok(output)
  }
}

/// Плагинная подсистема приложения.
pub struct PluginRuntime {
  plugins: Vec<LoadedPlugin>,
  sink: HostSink,
}

impl PluginRuntime {
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
  fn load_plugin_dir(
    dir: &Path,
    sink: &HostSink,
  ) -> Result<LoadedPlugin, PluginError> {
    let manifest =
      PluginManifest::load(&dir.join(MANIFEST_FILE_NAME)).map_err(|e| {
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

    let extism_manifest =
      Manifest::new([Wasm::file(&wasm_path)]).disallow_all_hosts();

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
    self
      .plugins
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
  let sink = sink_handle.lock().map_err(|_| {
    extism::Error::msg("не удалось захватить приёмник сообщений плагина")
  })?;
  sink.push(&message);
  Ok(())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::test_util;
  use std::path::PathBuf;

  /// WAT-модуль, экспортирующий функцию `invoke`, возвращающую код 0.
  const WAT_WITH_INVOKE: &str = r#"
    (module
      (func (export "invoke") (result i32)
        i32.const 0))
  "#;

  /// WAT-модуль без функции `invoke`.
  const WAT_WITHOUT_INVOKE: &str = r#"
    (module
      (func (export "other") (result i32)
        i32.const 0))
  "#;

  const MANIFEST_JSON: &str = r#"{
    "contract_version": 1,
    "name": "test-plugin",
    "description": "Тестовый плагин",
    "module": "plugin.wasm",
    "export": "invoke",
    "host_functions": ["log"]
  }"#;

  /// Создание корня плагинов с одной директорией плагина.
  fn setup_plugins_root(name: &str, wasm: &[u8]) -> PathBuf {
    let dir = test_util::test_root(&format!("plugin-runtime-{name}"));
    let plugin_dir = dir.join("test-plugin");
    fs::create_dir_all(&plugin_dir).expect("создание директории плагина");
    fs::write(plugin_dir.join(MANIFEST_FILE_NAME), MANIFEST_JSON).expect("манифест");
    fs::write(plugin_dir.join("plugin.wasm"), wasm).expect("модуль");
    dir
  }

  fn compile_wat(wat: &str) -> Vec<u8> {
    wat::parse_str(wat).expect("компиляция WAT")
  }

  #[test]
  fn loads_plugin_with_invoke_export() {
    let dir = setup_plugins_root("with-invoke", &compile_wat(WAT_WITH_INVOKE));
    let runtime = PluginRuntime::load(&dir).expect("загрузка runtime");
    assert_eq!(runtime.plugin_names(), vec!["test-plugin"], "плагин загружен");
    test_util::cleanup(&dir);
  }

  #[test]
  fn rejects_plugin_without_invoke_export() {
    let dir = setup_plugins_root("without-invoke", &compile_wat(WAT_WITHOUT_INVOKE));
    let runtime = PluginRuntime::load(&dir).expect("загрузка runtime");
    assert!(
      runtime.plugin_names().is_empty(),
      "плагин без invoke отбракован"
    );
    test_util::cleanup(&dir);
  }

  #[test]
  fn invokes_loaded_plugin() {
    let dir = setup_plugins_root("invoke", &compile_wat(WAT_WITH_INVOKE));
    let mut runtime = PluginRuntime::load(&dir).expect("загрузка runtime");
    let output = runtime
      .invoke("test-plugin", "привет")
      .expect("вызов плагина");
    assert_eq!(output, "", "модуль возвращает пустой вывод");
    test_util::cleanup(&dir);
  }

  #[test]
  fn empty_dir_produces_no_plugins() {
    let dir = test_util::test_root("plugin-runtime-empty");

    let runtime = PluginRuntime::load(&dir).expect("загрузка пустого каталога");
    assert!(runtime.plugin_names().is_empty(), "нет плагинов в пустой папке");
    test_util::cleanup(&dir);
  }

  #[test]
  fn loads_and_invokes_bundled_demo_plugin() {
    let root = test_util::test_root("plugin-runtime-demo");
    let plugin_dir = root.join("demo-plugin");
    fs::create_dir_all(&plugin_dir).expect("создание директории плагина");
    let resources = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
      .join("resources")
      .join("plugins")
      .join("demo-plugin");
    for file in ["plugin-manifest.json", "demo_plugin.wasm"] {
      fs::copy(resources.join(file), plugin_dir.join(file)).expect("копирование ресурса");
    }

    let mut runtime = PluginRuntime::load(&root).expect("загрузка runtime");
    assert_eq!(runtime.plugin_names(), vec!["demo-plugin"], "demo-плагин загружен");

    let output = runtime
      .invoke("demo-plugin", r#"{"title":"Тест"}"#)
      .expect("вызов demo-плагина");
    let parsed: serde_json::Value = serde_json::from_str(&output).expect("JSON-ответ");
    let greeting = parsed["greeting"].as_str().expect("поле greeting");
    assert!(greeting.contains("Тест"), "ответ содержит переданное имя");

    let logs = runtime.logs();
    assert!(
      logs.iter().any(|m| m.contains("Тест")),
      "host-функция log передала сообщение приложению"
    );

    test_util::cleanup(&root);
  }
}