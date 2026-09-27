//! Извлечение метаданных книги из содержимого файла.
//!
//! Диспетчер по формату: каждый формат имеет собственный анализатор. Ошибка
//! разбора не прерывает работу — возвращаются пустые метаданные, а вызывающий
//! использует фолбэки.

use super::fs::Fs;
use super::models::BookMetadata;
use super::{djvu, epub, fb2, pdf};

/// Извлечение метаданных и обложки из файла книги по его формату.
pub(crate) fn extract(fs: &impl Fs, path: &str, format: &str) -> BookMetadata {
    let Ok(bytes) = fs.read_bytes(path) else {
        return BookMetadata::default();
    };
    match format {
        "epub" => epub::extract(&bytes).unwrap_or_default(),
        "fb2" => fb2::extract(&bytes),
        "pdf" => pdf::extract(&bytes),
        "djvu" => djvu::extract(&bytes),
        _ => BookMetadata::default(),
    }
}

/// Извлечение обложки из файла книги.
pub(crate) fn cover(fs: &impl Fs, path: &str, format: &str) -> Option<(Vec<u8>, String)> {
    extract(fs, path, format).cover
}
