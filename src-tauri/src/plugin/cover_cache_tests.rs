//! Тесты дискового кэша обложек.

use super::*;
use crate::test_util;

/// Пустая запись обложки без данных.
fn entry(size: u64, mtime_ms: i64) -> CoverEntry {
    CoverEntry {
        size: Some(size),
        mtime_ms: Some(mtime_ms),
        cover: Some(CoverData {
            format: "png".to_string(),
            data: "AAAA".to_string(),
        }),
    }
}

/// Свежесть определяется совпадением размера и времени изменения файла.
#[test]
fn fresh_matches_size_and_mtime() {
    let mut cache = CoverCache::default();
    cache.store(
        "/lib/a.epub",
        Some(10),
        Some(100),
        Some(CoverData {
            format: "png".to_string(),
            data: "AAAA".to_string(),
        }),
    );

    assert!(cache.fresh("/lib/a.epub", Some(10), Some(100)).is_some());
    // Изменение размера или времени делает запись несвежей.
    assert!(cache.fresh("/lib/a.epub", Some(11), Some(100)).is_none());
    assert!(cache.fresh("/lib/a.epub", Some(10), Some(101)).is_none());
    assert!(cache.fresh("/lib/b.epub", Some(10), Some(100)).is_none());
}

/// Запись без метаданных файла не сохраняется и не считается свежей.
#[test]
fn store_requires_metadata() {
    let mut cache = CoverCache::default();
    cache.store("/lib/a.epub", None, Some(100), None);

    assert!(cache.covers.is_empty());
    assert!(cache.fresh("/lib/a.epub", Some(10), Some(100)).is_none());
}

/// Кэш переживает запись и чтение с диска.
#[test]
fn persists_between_loads() {
    let root = test_util::test_root("cover-cache-round-trip");
    let mut cache = CoverCache::default();
    cache
        .covers
        .insert("/lib/a.epub".to_string(), entry(10, 100));
    cache.save(&root).expect("сохранение кэша");

    let loaded = CoverCache::load(&root);
    assert_eq!(loaded.covers.get("/lib/a.epub"), Some(&entry(10, 100)));
    test_util::cleanup(&root);
}

/// Отсутствие файла кэша даёт пустой кэш, а не ошибку.
#[test]
fn missing_file_is_empty_cache() {
    let root = test_util::test_root("cover-cache-missing");
    let cache = CoverCache::load(&root);
    assert!(cache.covers.is_empty());
    test_util::cleanup(&root);
}
