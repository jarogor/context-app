//! Дисковый кэш обложек книг по пути.
//!
//! Обложка извлекается из файла книги плагином формата — это дорого (файл
//! читается и разбирается целиком). Список рабочих мест адресует книги путями и
//! обязан показывать обложки сразу, поэтому результат извлечения сохраняется
//! между запусками и переиспользуется, пока файл не изменился: свежесть записи
//! определяется размером и временем изменения файла. Кэш принадлежит приложению
//! и лежит в его служебном каталоге состояния.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::atomic_file;

/// Имя файла кэша в служебном каталоге приложения.
const COVER_CACHE_FILE_NAME: &str = "cover-cache.json";

/// Данные обложки: формат изображения и содержимое в base64.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoverData {
    /// Формат изображения (`png`, `jpeg` и подобное).
    pub format: String,
    /// Обложка в base64 без префикса data URI.
    pub data: String,
}

/// Запись кэша обложки: метаданные файла на момент извлечения и сама обложка.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CoverEntry {
    /// Размер файла книги на момент извлечения.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Время изменения файла книги (Unix, мс) на момент извлечения.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<i64>,
    /// Обложка или её отсутствие (`None` — обложки нет).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cover: Option<CoverData>,
}

/// Кэш обложек: абсолютный путь книги → запись обложки.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CoverCache {
    /// Обложки по абсолютному пути книги.
    #[serde(default)]
    pub covers: BTreeMap<String, CoverEntry>,
}

impl CoverCache {
    /// Загрузка кэша из служебного каталога; отсутствие файла даёт пустой кэш.
    pub fn load(root: &Path) -> Self {
        atomic_file::read_json_or_default(&cover_cache_path(root)).unwrap_or_default()
    }

    /// Сохранение кэша атомарной записью.
    pub fn save(&self, root: &Path) -> Result<(), String> {
        atomic_file::write_json(&cover_cache_path(root), self).map_err(|error| error.to_string())
    }

    /// Актуальная запись обложки: файл книги не изменился с момента извлечения.
    ///
    /// Без известных размера и времени изменения свежей записи нет: сравнить
    /// нечего, и обложку нужно извлечь заново.
    pub fn fresh(
        &self,
        path: &str,
        size: Option<u64>,
        mtime_ms: Option<i64>,
    ) -> Option<&CoverEntry> {
        let (Some(size), Some(mtime_ms)) = (size, mtime_ms) else {
            return None;
        };
        let entry = self.covers.get(path)?;
        if entry.size == Some(size) && entry.mtime_ms == Some(mtime_ms) {
            Some(entry)
        } else {
            None
        }
    }

    /// Сохранение записи обложки при известных метаданных файла.
    ///
    /// Без метаданных запись не сохраняется: иначе «свежесть» была бы
    /// недоказуемой и обложка залипла бы навсегда.
    pub fn store(
        &mut self,
        path: &str,
        size: Option<u64>,
        mtime_ms: Option<i64>,
        cover: Option<CoverData>,
    ) {
        if size.is_none() || mtime_ms.is_none() {
            return;
        }
        self.covers.insert(
            path.to_string(),
            CoverEntry {
                size,
                mtime_ms,
                cover,
            },
        );
    }
}

/// Путь файла кэша обложек в служебном каталоге состояния.
fn cover_cache_path(root: &Path) -> PathBuf {
    root.join(COVER_CACHE_FILE_NAME)
}

#[cfg(test)]
#[path = "cover_cache_tests.rs"]
mod tests;
