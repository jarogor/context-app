//! История открытых библиотек.
//!
//! Реестр принадлежит ядру: запись хранит путь и провайдера (идентификатор
//! source-плагина), а также необязательное пользовательское оформление (название,
//! описание, иконка, цвет). В выдачу попадают только записи доступных и
//! включённых провайдеров; недоступные сохраняются, но скрываются.
//!
//! Оформление — дополнение к записи, а не её замена: незаданные поля ничего не
//! меняют, а повторное открытие библиотеки сохраняет уже выбранное оформление.

use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::documents::{self, LIBRARY_HISTORY};
use crate::plugin::SourceProvider;

/// Имя файла истории в служебном каталоге состояния.
const HISTORY_FILE_NAME: &str = "library-history.json";

/// Пользовательское оформление записи истории.
///
/// Поля необязательны: пустая строка и отсутствие значения одинаково означают
/// «не задано». Иконка и цвет — непрозрачные идентификаторы выбора интерфейса;
/// ядро их не толкует и лишь хранит.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct LibraryAppearance {
    /// Пользовательское название библиотеки.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// Пользовательское описание библиотеки.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    /// Иконка оформления библиотеки.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
    /// Цвет оформления библиотеки.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl LibraryAppearance {
    /// Оформление без заданных полей.
    pub fn is_empty(&self) -> bool {
        self.name.is_none()
            && self.description.is_none()
            && self.icon.is_none()
            && self.color.is_none()
    }

    /// Оформление с очищенными от пробелов полями; пустая строка — «не задано».
    fn cleaned(self) -> Self {
        Self {
            name: optional_text(self.name),
            description: optional_text(self.description),
            icon: optional_text(self.icon),
            color: optional_text(self.color),
        }
    }
}

/// Необязательный текст: пустая строка читается как «не задано».
fn optional_text(value: Option<String>) -> Option<String> {
    value
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
}

/// Сохранённая запись истории.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HistoryRecord {
    /// Путь библиотеки.
    pub path: String,
    /// Идентификатор source-плагина, которым открыта библиотека.
    pub provider: String,
    /// Время добавления записи (Unix, мс).
    pub added_at_millis: u64,
    /// Пользовательское оформление записи; незаданные поля не пишутся.
    #[serde(flatten)]
    pub appearance: LibraryAppearance,
}

/// Содержимое файла истории.
#[derive(Debug, Default, Serialize, Deserialize)]
struct HistoryFile {
    /// Записи истории в порядке от новых к старым.
    #[serde(default)]
    entries: Vec<HistoryRecord>,
}

/// Запись истории в представлении для UI.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct HistoryEntry {
    /// Путь библиотеки.
    pub path: String,
    /// Идентификатор провайдера библиотеки.
    pub provider: String,
    /// Человекочитаемое имя провайдера.
    pub provider_name: String,
    /// Время открытия записи (Unix, мс).
    pub added_at_millis: u64,
    /// Существует ли директория библиотеки.
    pub available: bool,
    /// Пользовательское оформление записи в форме самой записи.
    #[serde(flatten)]
    pub appearance: LibraryAppearance,
}

/// Список истории, отфильтрованный по доступным и включённым провайдерам.
///
/// `available` — обнаруженные source-плагины; `disabled` — отключённые
/// идентификаторы. Записи отключённых или отсутствующих провайдеров
/// сохраняются, но не выдаются.
pub fn list(
    root: &Path,
    available: &[SourceProvider],
    disabled: &[String],
) -> Result<Vec<HistoryEntry>, String> {
    let file = load(root)?;
    Ok(file
        .entries
        .into_iter()
        .filter_map(|record| {
            let provider = available.iter().find(|item| item.id == record.provider)?;
            if disabled.iter().any(|id| id == &record.provider) {
                return None;
            }
            Some(HistoryEntry {
                available: Path::new(&record.path).is_dir(),
                path: record.path,
                provider: record.provider,
                provider_name: provider.name.clone(),
                added_at_millis: record.added_at_millis,
                appearance: record.appearance,
            })
        })
        .collect())
}

/// Запоминание открытой библиотеки: перемещение наверх без дублирования.
///
/// Оформление уже известной библиотеки сохраняется: повторное открытие не
/// сбрасывает выбранные пользователем название, описание, иконку и цвет.
pub fn remember(root: &Path, path: &str, provider: &str) -> Result<(), String> {
    let mut file = load(root)?;
    let appearance = file
        .entries
        .iter()
        .find(|record| record.path == path)
        .map(|record| record.appearance.clone())
        .unwrap_or_default();
    file.entries.retain(|record| record.path != path);
    file.entries.insert(
        0,
        HistoryRecord {
            path: path.to_string(),
            provider: provider.to_string(),
            added_at_millis: now_millis(),
            appearance,
        },
    );
    save(root, &file)
}

/// Запись пользовательского оформления библиотеки.
///
/// Оформление заменяется целиком: `None` в поле означает «снять оформление», а
/// пустая строка читается как «не задано». Запись о незнакомой библиотеке не
/// создаётся — оформлять можно только то, что уже есть в списке. Возвращается
/// признак найденной записи.
pub fn set_appearance(
    root: &Path,
    path: &str,
    appearance: LibraryAppearance,
) -> Result<bool, String> {
    let mut file = load(root)?;
    let Some(record) = file.entries.iter_mut().find(|record| record.path == path) else {
        return Ok(false);
    };
    record.appearance = appearance.cleaned();
    save(root, &file)?;
    Ok(true)
}

/// Удаление записи истории по пути библиотеки.
pub fn forget(root: &Path, path: &str) -> Result<(), String> {
    let mut file = load(root)?;
    file.entries.retain(|record| record.path != path);
    save(root, &file)
}

/// Путь файла истории в служебном каталоге состояния.
fn history_path(root: &Path) -> PathBuf {
    root.join(HISTORY_FILE_NAME)
}

/// Загрузка истории; отсутствующий файл — пустая история.
fn load(root: &Path) -> Result<HistoryFile, String> {
    documents::read_or_default(&history_path(root), &LIBRARY_HISTORY)
}

/// Атомарная запись истории.
fn save(root: &Path, file: &HistoryFile) -> Result<(), String> {
    documents::write(&history_path(root), &LIBRARY_HISTORY, file)
}

/// Текущее время Unix в миллисекундах.
fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "library_history_tests.rs"]
mod tests;
