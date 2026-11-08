//! Извлечение метаданных книги из содержимого файла.
//!
//! Диспетчер по формату: каждый формат имеет собственный анализатор. Ошибка
//! разбора не прерывает работу — возвращаются пустые метаданные, а вызывающий
//! использует фолбэки.
//!
//! **Чтение диапазоном.** Крупную книгу нельзя читать в память WASM целиком:
//! у файла в сотни мегабайт это исчерпывает память плагина и роняет открытие
//! всей библиотеки. Поэтому разбор забирает только нужные куски:
//! - PDF — хвост файла: словарь `/Info` лежит в трейлере;
//! - FB2 и DjVu — небольшое окно в начале файла;
//! - EPUB — файл целиком: это ZIP-архив, оглавление ищется по центральному
//!   каталогу в конце, а он без всего файла не читается. Книги EPUB обычно
//!   небольшие, и ограничение здесь — размер архива, а не размер текста.

use super::fs::Fs;
use super::models::BookMetadata;
use super::{djvu, epub, fb2, pdf};

/// Размер окна поиска метаданных в начале файла (FB2, DjVu).
const HEAD_WINDOW: u64 = 256 * 1024;

/// Размер хвоста файла для словаря `/Info` в PDF.
///
/// PDF пишет `/Info` в конце, рядом с таблицей ссылок. Хвост в четверть
/// мегабайта покрывает обычные документы; если словаря там нет, метаданные
/// остаются пустыми, и название берётся из имени файла.
const PDF_TAIL_WINDOW: u64 = 512 * 1024;

/// Форматы, которые разбираются без чтения файла целиком.
const RANGE_FORMATS: &[&str] = &["pdf", "fb2", "djvu", "djv"];

/// Извлечение метаданных и обложки из файла книги по его формату.
///
/// `size` — размер файла из листинга каталога: по нему вычисляется хвост PDF.
pub(crate) fn extract(fs: &impl Fs, path: &str, format: &str, size: Option<u64>) -> BookMetadata {
    // Формат без анализатора не читает файл вовсе: незачем грузить байты.
    if !matches!(format, "epub" | "fb2" | "pdf" | "djvu" | "djv") {
        return BookMetadata::default();
    }
    match format {
        // EPUB — ZIP-архив: без файла целиком не найти его оглавление.
        "epub" => fs
            .read_bytes(path)
            .map(|bytes| epub::extract(&bytes).unwrap_or_default())
            .unwrap_or_default(),
        _ => read_range_metadata(fs, path, format, size),
    }
}

/// Разбор метаданных по нужному куску файла.
///
/// Если частичное чтение недоступно, файл читается целиком: так работают
/// реализации `Fs` без поддержки диапазонов (нативные тесты).
fn read_range_metadata(fs: &impl Fs, path: &str, format: &str, size: Option<u64>) -> BookMetadata {
    let Some(total) = size else {
        return fs
            .read_bytes(path)
            .map(|bytes| extract_bytes(&bytes, format))
            .unwrap_or_default();
    };
    if !RANGE_FORMATS.contains(&format) {
        return BookMetadata::default();
    }
    // PDF: словарь `/Info` лежит в хвосте файла.
    let (offset, length) = if format == "pdf" {
        let length = PDF_TAIL_WINDOW.min(total);
        (total - length, length)
    } else {
        (0, HEAD_WINDOW.min(total))
    };
    let Ok(bytes) = fs.read_range(path, offset, length) else {
        return BookMetadata::default();
    };
    extract_bytes(&bytes, format)
}

/// Разбор метаданных из подготовленных байтов формата.
fn extract_bytes(bytes: &[u8], format: &str) -> BookMetadata {
    match format {
        "fb2" => fb2::extract(bytes),
        "pdf" => pdf::extract(bytes),
        "djvu" | "djv" => djvu::extract(bytes),
        _ => BookMetadata::default(),
    }
}

/// Извлечение обложки из файла книги.
///
/// Обложка берётся только у EPUB: у остальных форматов её извлечение требует
/// полного разбора файла, а он читает книгу целиком.
pub(crate) fn cover(fs: &impl Fs, path: &str, format: &str) -> Option<(Vec<u8>, String)> {
    extract(fs, path, format, None).cover
}
