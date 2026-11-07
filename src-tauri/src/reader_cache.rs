//! Дисковый кэш свойств открытого файла: закладки, число страниц, превью и
//! встроенные пометки.
//!
//! Свойства файла добываются дорого: PDF и DjVu разбирают страницы и рисуют
//! миниатюры, что занимает секунды. Вкладка рабочего места открывает один и тот
//! же файл много раз, поэтому результат сохраняется между запусками и
//! переиспользуется, пока файл не изменился: свежесть записи определяется
//! размером и временем изменения файла, как у кэша обложек.
//!
//! Ядро **не интерпретирует** свойства: `properties` и `annotations` — opaque
//! JSON плагина формата, а превью — картинки. Превью хранятся отдельными
//! файлами: у книги в сотни страниц общий JSON разросся бы до мегабайт и
//! переписывался бы на каждую порцию.
//!
//! Каталог кэша приложения:
//! `app-state/reader-cache/<sha256 пути>/meta.json` и `t-<страница>.jpg`.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use crate::atomic_file;
use crate::documents::{self, READER_CACHE};

/// Имя каталога кэша в служебном каталоге приложения.
const CACHE_DIR_NAME: &str = "reader-cache";
/// Имя файла описания свойств книги.
const META_FILE_NAME: &str = "meta.json";

/// Превью страницы в кэше: страница, файл и размеры картинки.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CachedThumb {
    /// Номер страницы (1-based).
    pub page: u32,
    /// Имя файла картинки в каталоге книги.
    pub file: String,
    /// Ширина картинки в пикселях.
    #[serde(default)]
    pub width: u32,
    /// Высота картинки в пикселях.
    #[serde(default)]
    pub height: u32,
}

/// Описание свойств книги в кэше.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ReaderCacheMeta {
    /// Абсолютный путь файла книги.
    #[serde(default)]
    pub path: String,
    /// Размер файла на момент разбора.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    /// Время изменения файла (Unix, мс) на момент разбора.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mtime_ms: Option<i64>,
    /// Opaque-свойства плагина (закладки, число страниц и подобное).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<serde_json::Value>,
    /// Opaque-результат разбора встроенных пометок.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Value>,
    /// Превью страниц: страница → описание файла.
    #[serde(default)]
    pub thumbs: BTreeMap<u32, CachedThumb>,
}

/// Запись превью, присланная оболочкой: страница и data-URL картинки.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThumbInput {
    /// Номер страницы (1-based).
    pub page: u32,
    /// Картинка как `data:`-URL.
    #[serde(rename = "dataUrl", default)]
    pub data_url: String,
    /// Ширина картинки в пикселях.
    #[serde(default)]
    pub width: u32,
    /// Высота картинки в пикселях.
    #[serde(default)]
    pub height: u32,
}

/// Запись кэша, отданная оболочке: свойства, пометки и превью с картинками.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ReaderCacheEntry {
    /// Opaque-свойства плагина.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub properties: Option<serde_json::Value>,
    /// Opaque-результат разбора пометок.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub annotations: Option<serde_json::Value>,
    /// Превью страниц: страница → data-URL.
    #[serde(default)]
    pub thumbs: BTreeMap<u32, String>,
}

impl ReaderCacheEntry {
    /// Пустая ли запись: ни свойств, ни пометок, ни превью.
    pub fn is_empty(&self) -> bool {
        self.properties.is_none() && self.annotations.is_none() && self.thumbs.is_empty()
    }
}

/// Каталог кэша книги по пути.
///
/// Имя каталога — SHA-256 пути: путь бывает длинным и содержит разделители,
/// а хеш даёт постоянное безопасное имя. Совпадение путей в одном каталоге
/// невозможно, коллизия хеша практически исключена.
pub fn book_dir(root: &Path, path: &str) -> PathBuf {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    let digest = hasher.finalize();
    let mut name = String::with_capacity(digest.len() * 2);
    for byte in digest {
        name.push_str(&format!("{byte:02x}"));
    }
    root.join(CACHE_DIR_NAME).join(name)
}

/// Чтение описания свойств книги; отсутствие или порча файла дают `None`.
pub fn read_meta(root: &Path, path: &str) -> Option<ReaderCacheMeta> {
    let file = book_dir(root, path).join(META_FILE_NAME);
    let meta: ReaderCacheMeta = documents::read(&file, &READER_CACHE).ok()??;
    if meta.size.is_none() || meta.mtime_ms.is_none() {
        return None;
    }
    Some(meta)
}

/// Актуальная ли запись: файл книги не изменился с момента разбора.
pub fn is_fresh(meta: &ReaderCacheMeta, size: Option<u64>, mtime_ms: Option<i64>) -> bool {
    let (Some(size), Some(mtime_ms)) = (size, mtime_ms) else {
        return false;
    };
    meta.size == Some(size) && meta.mtime_ms == Some(mtime_ms)
}

/// Чтение записи кэша вместе с картинками превью.
///
/// Отсутствующая или повреждённая картинка пропускается: остальные свойства
/// книги остаются полезными, а недостающее превью дорисуется заново.
pub fn read_entry(root: &Path, path: &str, meta: &ReaderCacheMeta) -> ReaderCacheEntry {
    let dir = book_dir(root, path);
    let mut thumbs = BTreeMap::new();
    for (page, thumb) in &meta.thumbs {
        let file = dir.join(&thumb.file);
        let Ok(bytes) = std::fs::read(&file) else {
            continue;
        };
        let Some(data_url) = data_url_of(&bytes) else {
            continue;
        };
        thumbs.insert(*page, data_url);
    }
    ReaderCacheEntry {
        properties: meta.properties.clone(),
        annotations: meta.annotations.clone(),
        thumbs,
    }
}

/// Сборка data-URL по байтам картинки.
fn data_url_of(bytes: &[u8]) -> Option<String> {
    let mime = if bytes.starts_with(&[0xFF, 0xD8]) {
        "image/jpeg"
    } else if bytes.starts_with(b"\x89PNG") {
        "image/png"
    } else {
        return None;
    };
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes);
    Some(format!("data:{mime};base64,{encoded}"))
}

/// Разбор data-URL картинки: MIME и байты; неподдерживаемый формат даёт `None`.
pub fn parse_data_url(value: &str) -> Option<(String, Vec<u8>)> {
    let rest = value.strip_prefix("data:")?;
    let (header, payload) = rest.split_once(',')?;
    if !header.ends_with(";base64") {
        return None;
    }
    let mime = header.trim_end_matches(";base64").to_string();
    if !mime.starts_with("image/") {
        return None;
    }
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, payload).ok()?;
    Some((mime, bytes))
}

/// Расширение файла картинки по MIME.
fn extension_of(mime: &str) -> &'static str {
    if mime == "image/png" {
        "png"
    } else {
        "jpg"
    }
}

/// Сохранение порции свойств книги с объединением.
///
/// Заданные поля перекрывают прежние: оболочка присылает свойства, пометки и
/// превью порциями по мере готовности. Превью, пришедшее повторно, перезаписывает
/// прежнее.
pub fn save(
    root: &Path,
    path: &str,
    size: Option<u64>,
    mtime_ms: Option<i64>,
    properties: Option<serde_json::Value>,
    annotations: Option<serde_json::Value>,
    thumbs: &[ThumbInput],
) -> Result<(), String> {
    if size.is_none() || mtime_ms.is_none() {
        return Err("нет метаданных файла книги".to_string());
    }
    let dir = book_dir(root, path);
    let previous = read_meta(root, path);
    // Файл изменился — прежние свойства и превью недействительны.
    let fresh = previous
        .as_ref()
        .is_some_and(|meta| is_fresh(meta, size, mtime_ms));
    let mut meta = if fresh {
        previous.unwrap_or_default()
    } else {
        ReaderCacheMeta::default()
    };
    meta.path = path.to_string();
    meta.size = size;
    meta.mtime_ms = mtime_ms;
    if properties.is_some() {
        meta.properties = properties;
    }
    if annotations.is_some() {
        meta.annotations = annotations;
    }
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    for thumb in thumbs {
        let Some((mime, bytes)) = parse_data_url(&thumb.data_url) else {
            continue;
        };
        let file = format!("t-{}.{}", thumb.page, extension_of(&mime));
        atomic_file::atomic_write(&dir.join(&file), &bytes).map_err(|error| error.to_string())?;
        meta.thumbs.insert(
            thumb.page,
            CachedThumb {
                page: thumb.page,
                file,
                width: thumb.width,
                height: thumb.height,
            },
        );
    }
    documents::write(&dir.join(META_FILE_NAME), &READER_CACHE, &meta)
}

/// Удаление кэша книги: свойств, пометок и картинок превью.
pub fn forget(root: &Path, path: &str) -> Result<(), String> {
    let dir = book_dir(root, path);
    match std::fs::remove_dir_all(&dir) {
        Ok(()) => Ok(()),
        // Кэша не было — забывать нечего.
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}

#[cfg(test)]
#[path = "reader_cache_tests.rs"]
mod tests;
