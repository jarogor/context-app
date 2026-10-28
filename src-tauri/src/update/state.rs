//! Сохранение настроек и результатов проверки обновлений.
//!
//! Файл живёт в служебном каталоге состояния приложения и переживает
//! перезапуск: источник обновлений, признак проверки при запуске и последняя
//! проверка.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::atomic_file;

use super::models::{UpdateCheck, UpdateConfig};

/// Имя файла состояния обновлений.
const FILE_NAME: &str = "updates.json";

/// Состояние обновлений на диске.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct PersistedUpdate {
    /// Настройки обновлений.
    #[serde(default)]
    pub config: UpdateConfig,
    /// Результат последней проверки, если она выполнялась.
    #[serde(default)]
    pub last_check: Option<UpdateCheck>,
}

impl PersistedUpdate {
    /// Создание состояния с источником по умолчанию.
    pub fn with_source(source: Option<super::models::UpdateSource>) -> Self {
        Self {
            config: UpdateConfig::with_source(source),
            last_check: None,
        }
    }
}

/// Загрузка состояния обновлений; отсутствие файла даёт пустое состояние.
pub fn load(root: &Path) -> Result<PersistedUpdate, String> {
    atomic_file::read_json_or_default::<PersistedUpdate>(&file_path(root))
        .map_err(|error| error.to_string())
}

/// Загрузка состояния с источником по умолчанию, если он не задан.
pub fn load_or_default(
    root: &Path,
    default_source: Option<super::models::UpdateSource>,
) -> Result<PersistedUpdate, String> {
    let path = file_path(root);
    let mut state = if path.is_file() {
        load(root)?
    } else {
        PersistedUpdate::default()
    };
    if state.config.source.is_none() {
        state.config.source = default_source;
    }
    Ok(state)
}

/// Сохранение состояния обновлений.
pub fn save(root: &Path, state: &PersistedUpdate) -> Result<(), String> {
    atomic_file::write_json(&file_path(root), state).map_err(|error| error.to_string())
}

/// Сохранение только настроек, с сохранением последней проверки.
pub fn save_config(root: &Path, config: &UpdateConfig) -> Result<PersistedUpdate, String> {
    let mut state = load_or_default(root, super::default_source())?;
    state.config = config.clone();
    save(root, &state)?;
    Ok(state)
}

/// Запись результата проверки.
pub fn record_check(root: &Path, check: &UpdateCheck) -> Result<PersistedUpdate, String> {
    let mut state = load_or_default(root, super::default_source())?;
    state.last_check = Some(check.clone());
    save(root, &state)?;
    Ok(state)
}

/// Запоминание версии, которую пользователь попросил больше не предлагать.
pub fn skip_version(root: &Path, version: &str) -> Result<PersistedUpdate, String> {
    let mut state = load_or_default(root, super::default_source())?;
    state.config.skipped_version = Some(version.to_string());
    save(root, &state)?;
    Ok(state)
}

/// Путь файла состояния обновлений.
pub fn file_path(root: &Path) -> PathBuf {
    root.join(FILE_NAME)
}

#[cfg(test)]
#[path = "state_tests.rs"]
mod tests;
