//! Модели проверки и установки обновлений.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

/// Источник обновлений: файловый каталог или сетевой адрес.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateSource {
    /// Вид источника: `file` или `network`.
    pub kind: String,
    /// Каталог файлового источника или базовый адрес сетевого.
    pub location: String,
}

impl UpdateSource {
    /// Проверка, что вид источника известен.
    pub fn validate(&self) -> Result<(), String> {
        if !matches!(self.kind.as_str(), "file" | "network") {
            return Err(format!(
                "неизвестный вид источника обновлений: {}",
                self.kind
            ));
        }
        if self.location.trim().is_empty() {
            return Err("расположение источника обновлений не указано".to_string());
        }
        Ok(())
    }
}

/// Сохранённые настройки обновлений.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateConfig {
    /// Настроенный источник обновлений ядра.
    #[serde(default)]
    pub source: Option<UpdateSource>,
    /// Проверять обновления при запуске приложения.
    #[serde(default = "default_check_on_startup")]
    pub check_on_startup: bool,
    /// Версия, которую пользователь попросил больше не предлагать.
    #[serde(default)]
    pub skipped_version: Option<String>,
}

impl Default for UpdateConfig {
    /// Настройки по умолчанию: источник не задан, проверка при запуске включена.
    fn default() -> Self {
        Self {
            source: None,
            check_on_startup: default_check_on_startup(),
            skipped_version: None,
        }
    }
}

impl UpdateConfig {
    /// Создание настроек со значением проверки при запуске по умолчанию.
    pub fn with_source(source: Option<UpdateSource>) -> Self {
        Self {
            source,
            check_on_startup: default_check_on_startup(),
            skipped_version: None,
        }
    }
}

/// Значение проверки обновлений при запуске по умолчанию.
fn default_check_on_startup() -> bool {
    true
}

/// Индекс обновлений в источнике (`update-index.json`).
///
/// Здесь только выпуск ядра: прикладные плагины обновляются через стор из
/// `store-index.json` (см. `UPDATE.md`). Прежнее поле `plugins` в этом индексе
/// не читалось и удалено; сердце игнорирует неизвестные поля, поэтому старые
/// индексы продолжают разбираться.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateIndex {
    /// Версия контракта индекса.
    #[serde(default)]
    pub contract_version: u32,
    /// Выпуск ядра приложения.
    #[serde(default)]
    pub core: Option<CoreRelease>,
}

/// Выпуск ядра приложения: версия, заметки и артефакты по платформам.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CoreRelease {
    /// Версия выпуска в формате SemVer.
    pub version: String,
    /// Заметки о выпуске.
    #[serde(default)]
    pub notes: String,
    /// Артефакты выпуска по ключу `ОС-архитектура`.
    #[serde(default)]
    pub platforms: BTreeMap<String, ReleaseArtifact>,
}

/// Артефакт выпуска ядра.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ReleaseArtifact {
    /// Способ установки: `portable`, `appimage` или `installer`.
    #[serde(default)]
    pub mode: ReleaseMode,
    /// Путь относительно источника или абсолютный адрес.
    pub location: String,
    /// Контрольная сумма SHA-256 (hex); обязательна для сетевого источника.
    #[serde(default)]
    pub sha256: Option<String>,
}

/// Способ установки артефакта ядра.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ReleaseMode {
    /// Zip-архив, содержимое которого накладывается на каталог установки.
    #[default]
    Portable,
    /// Готовый AppImage, заменяющий текущий файл.
    Appimage,
    /// Штатный установщик платформы.
    Installer,
}

/// Доступное обновление ядра.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AvailableCore {
    /// Текущая версия приложения.
    pub current_version: String,
    /// Версия предлагаемого выпуска.
    pub version: String,
    /// Заметки о выпуске.
    pub notes: String,
    /// Способ установки.
    pub mode: ReleaseMode,
}

/// Результат проверки обновлений.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct UpdateCheck {
    /// Настроенный источник обновлений, если он есть.
    pub source: Option<UpdateSource>,
    /// Доступное обновление ядра.
    pub core: Option<AvailableCore>,
    /// Время проверки в миллисекундах Unix.
    pub checked_at_millis: i64,
    /// Ошибки чтения источника; отсутствие обновления ошибкой не считается.
    pub errors: Vec<String>,
}

/// Результат подготовки обновления ядра.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct ApplyOutcome {
    /// Версия подготовленного выпуска.
    pub version: String,
    /// Требуется ли перезапуск приложения.
    pub restart_required: bool,
    /// Путь к журналу применения обновления.
    pub log_path: String,
}
