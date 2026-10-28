//! Пакеты плагинов: инспекция, установка и удаление.
//!
//! Пакет — zip-архив с `plugin-manifest.json` в корне и WASM-модулем, на
//! который ссылается манифест. Распаковка выполняется ядром с проверкой путей
//! (защита от zip slip), запретом символических ссылок и лимитами на размер.

use std::fs::{self, File};
use std::io::{self, Read};
use std::path::Path;

use serde::Serialize;
use zip::ZipArchive;

use crate::plugin::contract::MANIFEST_FILE_NAME;
use crate::plugin::plugin_manifest::{is_safe_relative_path, PluginManifest};
use crate::plugin::{PluginError, PluginKind};

/// Максимальное число записей в пакете.
const MAX_ENTRIES: usize = 1024;

/// Максимальный суммарный размер распакованных данных в байтах.
const MAX_TOTAL_BYTES: u64 = 256 * 1024 * 1024;

/// Краткое описание установленного плагина.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct InstalledPlugin {
    /// Идентификатор плагина.
    pub id: String,
    /// Человекочитаемое имя плагина.
    pub name: String,
    /// Версия плагина в формате SemVer.
    pub version: String,
    /// Уровень плагина: каркас или приложение.
    pub level: String,
    /// Назначение плагина.
    pub kind: String,
    /// Версия контракта плагина.
    pub contract_version: u32,
    /// Описание плагина.
    pub description: String,
}

impl From<&PluginManifest> for InstalledPlugin {
    /// Создание описания из манифеста.
    fn from(manifest: &PluginManifest) -> Self {
        Self {
            id: manifest.id.clone(),
            name: manifest.name.clone(),
            version: manifest.version_or_zero(),
            level: manifest.level.to_string(),
            kind: manifest.kind.to_string(),
            contract_version: manifest.contract_version,
            description: manifest.description.clone(),
        }
    }
}

/// Чтение манифеста из пакета без установки.
pub fn inspect_package(archive: &Path) -> Result<PluginManifest, PluginError> {
    let file = File::open(archive).map_err(package_error)?;
    let mut zip = ZipArchive::new(file).map_err(package_error)?;
    let bytes = read_manifest_bytes(&mut zip)?;
    let manifest: PluginManifest =
        serde_json::from_slice(&bytes).map_err(|error| PluginError::Package {
            reason: format!("некорректный манифест пакета: {error}"),
        })?;
    manifest.validate(archive)?;
    Ok(manifest)
}

/// Установка пакета в пользовательский каталог плагинов.
///
/// Пакет распаковывается в промежуточный каталог рядом с целью, проверяется и
/// только затем атомарно переносится под идентификатором плагина. Если плагин с
/// таким идентификатором уже установлен, предыдущая версия заменяется новой:
/// старая папка сначала отводится в резерв и восстанавливается при неудаче.
/// Установка плагина каркаса отклоняется.
pub fn install_package(archive: &Path, root: &Path) -> Result<InstalledPlugin, PluginError> {
    fs::create_dir_all(root).map_err(package_error)?;
    let staging = tempfile::Builder::new()
        .prefix(".staging-")
        .tempdir_in(root)
        .map_err(package_error)?;

    let manifest = extract_package(archive, staging.path())?;
    if manifest.level.is_framework() {
        return Err(PluginError::Package {
            reason: "плагины каркаса не устанавливаются через стор".to_string(),
        });
    }
    if !manifest.module.trim().is_empty() {
        if !is_safe_relative_path(&manifest.module) {
            return Err(PluginError::Package {
                reason: format!("некорректный путь модуля в манифесте: {}", manifest.module),
            });
        }
        if !staging.path().join(&manifest.module).is_file() {
            return Err(PluginError::Package {
                reason: format!("модуль {} отсутствует в пакете", manifest.module),
            });
        }
    }
    if manifest.kind == PluginKind::Format {
        let viewer = manifest.viewer.as_deref().unwrap_or_default();
        if !is_safe_relative_path(viewer) {
            return Err(PluginError::Package {
                reason: format!("некорректный путь модуля рисования в манифесте: {viewer}"),
            });
        }
        if !staging.path().join(viewer).is_file() {
            return Err(PluginError::Package {
                reason: format!("модуль рисования {viewer} отсутствует в пакете"),
            });
        }
    }
    let target = root.join(&manifest.id);
    let backup = if target.exists() {
        let backup = root.join(format!(".backup-{}-{}", manifest.id, std::process::id()));
        if backup.exists() {
            fs::remove_dir_all(&backup).map_err(package_error)?;
        }
        fs::rename(&target, &backup).map_err(package_error)?;
        Some(backup)
    } else {
        None
    };

    let staged = staging.keep();
    if let Err(error) = fs::rename(&staged, &target) {
        let _ = fs::remove_dir_all(&staged);
        if let Some(backup) = &backup {
            let _ = fs::rename(backup, &target);
        }
        return Err(plugin_error(format!(
            "не удалось установить плагин: {error}"
        )));
    }
    if let Some(backup) = backup {
        let _ = fs::remove_dir_all(&backup);
    }
    Ok(InstalledPlugin::from(&manifest))
}

/// Удаление установленного плагина из пользовательского каталога по
/// идентификатору.
///
/// Удаляются только плагины пользовательского каталога; базовые и поставляемые
/// плагины в нём не лежат, поэтому операция для них завершается ошибкой.
pub fn uninstall_package(id: &str, root: &Path) -> Result<(), PluginError> {
    if uuid::Uuid::parse_str(id).is_err() {
        return Err(PluginError::Package {
            reason: format!("некорректный идентификатор плагина: {id}"),
        });
    }
    let target = root.join(id);
    if !target.is_dir() {
        return Err(PluginError::Package {
            reason: format!("плагин {id} не установлен"),
        });
    }
    fs::remove_dir_all(&target).map_err(package_error)?;
    Ok(())
}

/// Список установленных в пользовательском каталоге плагинов.
pub fn installed_plugins(root: &Path) -> Result<Vec<InstalledPlugin>, PluginError> {
    let mut result = Vec::new();
    let Ok(entries) = fs::read_dir(root) else {
        return Ok(result);
    };
    for entry in entries {
        let entry = entry.map_err(package_error)?;
        if !entry.file_type().map_err(package_error)?.is_dir() {
            continue;
        }
        let dir = entry.path();
        if dir
            .file_name()
            .and_then(|name| name.to_str())
            .map(|name| name.starts_with('.'))
            .unwrap_or(false)
        {
            continue;
        }
        let Ok(manifest) = PluginManifest::load(&dir.join(MANIFEST_FILE_NAME)) else {
            continue;
        };
        if manifest.validate(&dir).is_err() {
            continue;
        }
        result.push(InstalledPlugin::from(&manifest));
    }
    result.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(result)
}

/// Чтение байтов манифеста из архива.
fn read_manifest_bytes(zip: &mut ZipArchive<File>) -> Result<Vec<u8>, PluginError> {
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(package_error)?;
        if entry.name() == MANIFEST_FILE_NAME {
            let mut bytes = Vec::new();
            entry.read_to_end(&mut bytes).map_err(package_error)?;
            return Ok(bytes);
        }
    }
    Err(PluginError::Package {
        reason: format!("пакет не содержит {MANIFEST_FILE_NAME}"),
    })
}

/// Безопасная распаковка пакета во временный каталог.
fn extract_package(archive: &Path, destination: &Path) -> Result<PluginManifest, PluginError> {
    let file = File::open(archive).map_err(package_error)?;
    let mut zip = ZipArchive::new(file).map_err(package_error)?;
    if zip.len() > MAX_ENTRIES {
        return Err(PluginError::Package {
            reason: format!("в пакете слишком много файлов: {}", zip.len()),
        });
    }

    let mut total: u64 = 0;
    let mut manifest_bytes: Option<Vec<u8>> = None;
    for index in 0..zip.len() {
        let mut entry = zip.by_index(index).map_err(package_error)?;
        if let Some(mode) = entry.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                return Err(PluginError::Package {
                    reason: "пакет содержит символическую ссылку".to_string(),
                });
            }
        }
        let Some(relative) = entry.enclosed_name() else {
            return Err(PluginError::Package {
                reason: format!("некорректный путь в пакете: {}", entry.name()),
            });
        };
        let name = entry.name().to_string();
        total = total.saturating_add(entry.size());
        if total > MAX_TOTAL_BYTES {
            return Err(PluginError::Package {
                reason: "распакованный пакет превышает допустимый размер".to_string(),
            });
        }
        let target = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&target).map_err(package_error)?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(package_error)?;
        }
        let mut output = File::create(&target).map_err(package_error)?;
        io::copy(&mut entry, &mut output).map_err(package_error)?;
        if name == MANIFEST_FILE_NAME {
            manifest_bytes = Some(fs::read(&target).map_err(package_error)?);
        }
    }

    let bytes = manifest_bytes.ok_or_else(|| PluginError::Package {
        reason: format!("пакет не содержит {MANIFEST_FILE_NAME}"),
    })?;
    let manifest: PluginManifest =
        serde_json::from_slice(&bytes).map_err(|error| PluginError::Package {
            reason: format!("некорректный манифест пакета: {error}"),
        })?;
    manifest.validate(destination)?;
    Ok(manifest)
}

/// Преобразование произвольной ошибки в ошибку пакета.
fn package_error(error: impl std::fmt::Display) -> PluginError {
    plugin_error(error.to_string())
}

/// Ошибка пакета с текстовым описанием.
fn plugin_error(reason: String) -> PluginError {
    PluginError::Package { reason }
}

#[cfg(test)]
#[path = "package_tests.rs"]
mod tests;
