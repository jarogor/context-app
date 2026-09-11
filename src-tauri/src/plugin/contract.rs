//! Контракт extension point плагинной подсистемы.
//!
//! Контракт определяет стабильную точку расширения приложения:
//! структуру манифеста плагина, версизацию контракта и набор
//! host-функций, предоставляемых приложением.

use std::path::Path;

use serde::Deserialize;

use crate::plugin::PluginError;

/// Версия контракта, поддерживаемая текущим приложением.
pub const CONTRACT_VERSION: u32 = 1;

/// Имя файла манифеста плагина.
pub const MANIFEST_FILE_NAME: &str = "plugin-manifest.json";

/// Имя экспортируемой функции, ожидаемой от плагинов.
pub const EXPORT_FUNCTION: &str = "invoke";

/// Имя host-функции логирования, предоставляемой приложением.
pub const HOST_LOG_FUNCTION: &str = "log";

/// Список host-функций, предоставляемых приложением.
pub const HOST_FUNCTIONS: &[&str] = &[HOST_LOG_FUNCTION];

/// Манифест плагина в формате `plugin-manifest.json`.
///
/// Лежит в корне папки плагина и описывает, как приложение
/// должно загрузить модуль плагина.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct PluginManifest {
  /// Версия контракта, которой соответствует плагин.
  pub contract_version: u32,
  /// Уникальное имя плагина.
  pub name: String,
  /// Краткое описание назначения плагина.
  pub description: String,
  /// Имя файла WASM-модуля плагина внутри папки плагина.
  pub module: String,
  /// Имя экспортируемой функции, вызываемой в точке расширения.
  pub export: String,
  /// Имена host-функций, которые плагин может вызывать.
  pub host_functions: Vec<String>,
}

impl PluginManifest {
  /// Загрузка и парсинг манифеста из файла.
  pub fn load(path: &Path) -> Result<Self, PluginError> {
    let content = std::fs::read(path).map_err(|e| PluginError::InvalidManifest {
      dir: path.to_path_buf(),
      reason: e.to_string(),
    })?;
    let manifest: PluginManifest =
      serde_json::from_slice(&content).map_err(|e| PluginError::InvalidManifest {
        dir: path.to_path_buf(),
        reason: e.to_string(),
      })?;
    Ok(manifest)
  }

  /// Проверка соответствия манифеста контракту приложения.
  ///
  /// `dir` — директория плагина, включается в текст ошибки.
  pub fn validate(&self, dir: &Path) -> Result<(), PluginError> {
    if self.contract_version != CONTRACT_VERSION {
      return Err(PluginError::UnsupportedContract {
        dir: dir.to_path_buf(),
        version: self.contract_version,
      });
    }
    if self.name.trim().is_empty() {
      return Err(PluginError::InvalidManifest {
        dir: dir.to_path_buf(),
        reason: "имя плагина не может быть пустым".to_string(),
      });
    }
    if self.module.trim().is_empty() {
      return Err(PluginError::InvalidManifest {
        dir: dir.to_path_buf(),
        reason: "модуль плагина не указан".to_string(),
      });
    }
    if self.export.trim().is_empty() {
      return Err(PluginError::InvalidManifest {
        dir: dir.to_path_buf(),
        reason: "имя экспортируемой функции не указано".to_string(),
      });
    }
    Ok(())
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  use std::env;
  use std::fs;
  use std::path::PathBuf;
  use std::sync::atomic::{AtomicU32, Ordering};

  static COUNTER: AtomicU32 = AtomicU32::new(0);

  /// Создание временной директории с манифестом.
  fn write_manifest(content: &str) -> PathBuf {
    let dir = env::temp_dir()
      .join("jarogor-booklib-tests")
      .join(format!("plugin-contract-{}", COUNTER.fetch_add(1, Ordering::SeqCst)));
    if dir.exists() {
      fs::remove_dir_all(&dir).expect("очистка временной директории");
    }
    fs::create_dir_all(&dir).expect("создание временной директории");
    let path = dir.join(MANIFEST_FILE_NAME);
    fs::write(&path, content).expect("запись манифеста");
    path
  }

  #[test]
  fn parses_valid_manifest() {
    let path = write_manifest(
      r#"{
        "contract_version": 1,
        "name": "demo-plugin",
        "description": "Демонстрационный плагин",
        "module": "demo_plugin.wasm",
        "export": "invoke",
        "host_functions": ["log"]
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    assert_eq!(manifest.contract_version, CONTRACT_VERSION);
    assert_eq!(manifest.name, "demo-plugin");
    assert_eq!(manifest.module, "demo_plugin.wasm");
    assert_eq!(manifest.export, EXPORT_FUNCTION);
    assert_eq!(manifest.host_functions, vec![HOST_LOG_FUNCTION.to_string()]);

    let dir = path.parent().expect("директория");
    manifest.validate(dir).expect("валидный манифест принимается");
    fs::remove_dir_all(dir).expect("очистка");
  }

  #[test]
  fn unknown_contract_version_is_rejected() {
    let path = write_manifest(
      r#"{
        "contract_version": 99,
        "name": "plugin",
        "description": "x",
        "module": "p.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    );

    let manifest = PluginManifest::load(&path).expect("парсинг манифеста");
    let dir = path.parent().expect("директория");
    let result = manifest.validate(dir);
    assert!(result.is_err(), "неподдерживаемая версия отклоняется");
    assert!(
      matches!(result, Err(PluginError::UnsupportedContract { version: 99, .. })),
      "сообщение об ошибке содержит версию"
    );

    fs::remove_dir_all(dir).expect("очистка");
  }

  #[test]
  fn missing_fields_are_rejected() {
    let path = write_manifest(
      r#"{
        "contract_version": 1,
        "name": "plugin"
      }"#,
    );

    let result = PluginManifest::load(&path);
    assert!(result.is_err(), "манифест без обязательных полей отклоняется");

    let dir = path.parent().expect("директория");
    fs::remove_dir_all(dir).expect("очистка");
  }
}