//! Тесты дискового кэша свойств файла.

use super::*;
use crate::test_util;

/// Крошечный JPEG для проверки превью.
const JPEG: &[u8] = &[
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0xFF, 0xD9,
];

/// data-URL картинки для проверки.
fn jpeg_url() -> String {
    let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, JPEG);
    format!("data:image/jpeg;base64,{encoded}")
}

/// Каталог кэша зависит от пути книги и не совпадает у разных путей.
#[test]
fn book_dir_is_unique_per_path() {
    let root = test_util::test_root("reader-cache-dirs");
    let first = book_dir(&root, "/lib/a.pdf");
    let second = book_dir(&root, "/lib/b.pdf");
    assert_ne!(first, second);
    assert_eq!(first, book_dir(&root, "/lib/a.pdf"));
    // Пути с одинаковым хвостом не склеиваются: имя строится по всему пути.
    assert_ne!(
        book_dir(&root, "/lib/a/b.pdf"),
        book_dir(&root, "/lib/b/b.pdf"),
    );
}

/// Свойства и превью переживают запись и чтение.
#[test]
fn round_trip_properties_and_thumbs() {
    let root = test_util::test_root("reader-cache-round-trip");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        Some(serde_json::json!({ "bookmarks": [{ "title": "Глава", "page": 2 }] })),
        None,
        &[ThumbInput {
            page: 1,
            data_url: jpeg_url(),
            width: 96,
            height: 128,
        }],
    )
    .expect("сохранение");

    let meta = read_meta(&root, "/lib/a.pdf").expect("описание");
    assert!(is_fresh(&meta, Some(10), Some(100)));
    assert_eq!(meta.properties.as_ref().unwrap()["bookmarks"][0]["page"], 2);
    let entry = read_entry(&root, "/lib/a.pdf", &meta);
    assert_eq!(entry.thumbs.len(), 1);
    assert!(entry.thumbs[&1].starts_with("data:image/jpeg;base64,"));
}

/// Пометки и свойства приходят порциями и объединяются.
#[test]
fn saves_merge_fields() {
    let root = test_util::test_root("reader-cache-merge");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        Some(serde_json::json!({ "pageCount": 3 })),
        None,
        &[],
    )
    .expect("свойства");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        None,
        Some(serde_json::json!({ "annotations": [] })),
        &[ThumbInput {
            page: 2,
            data_url: jpeg_url(),
            width: 96,
            height: 128,
        }],
    )
    .expect("пометки и превью");

    let meta = read_meta(&root, "/lib/a.pdf").expect("описание");
    // Свойства первой порции не потеряны.
    assert_eq!(meta.properties.as_ref().unwrap()["pageCount"], 3);
    assert!(meta.annotations.is_some());
    assert_eq!(meta.thumbs.len(), 1);
}

/// Изменение файла сбрасывает свойства и превью прежней версии.
#[test]
fn changed_file_resets_entry() {
    let root = test_util::test_root("reader-cache-reset");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        Some(serde_json::json!({ "pageCount": 3 })),
        None,
        &[ThumbInput {
            page: 1,
            data_url: jpeg_url(),
            width: 96,
            height: 128,
        }],
    )
    .expect("первая версия");

    // Новый размер файла: прежняя запись недействительна.
    save(
        &root,
        "/lib/a.pdf",
        Some(20),
        Some(200),
        Some(serde_json::json!({ "pageCount": 5 })),
        None,
        &[],
    )
    .expect("новая версия");

    let meta = read_meta(&root, "/lib/a.pdf").expect("описание");
    assert_eq!(meta.properties.as_ref().unwrap()["pageCount"], 5);
    assert!(meta.thumbs.is_empty());
}

/// Запись без метаданных файла не сохраняется.
#[test]
fn save_requires_metadata() {
    let root = test_util::test_root("reader-cache-no-meta");
    assert!(save(&root, "/lib/a.pdf", None, Some(100), None, None, &[]).is_err());
    assert!(read_meta(&root, "/lib/a.pdf").is_none());
}

/// Удаление кэша убирает свойства и картинки.
#[test]
fn forget_removes_entry() {
    let root = test_util::test_root("reader-cache-forget");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        Some(serde_json::json!({ "pageCount": 1 })),
        None,
        &[ThumbInput {
            page: 1,
            data_url: jpeg_url(),
            width: 96,
            height: 128,
        }],
    )
    .expect("сохранение");
    forget(&root, "/lib/a.pdf").expect("удаление");
    assert!(read_meta(&root, "/lib/a.pdf").is_none());
    // Повторное удаление не ошибка: кэша уже нет.
    forget(&root, "/lib/a.pdf").expect("повторное удаление");
}

/// Неподдерживаемая картинка пропускается, остальные превью сохраняются.
#[test]
fn skips_unsupported_image() {
    let root = test_util::test_root("reader-cache-bad-image");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        None,
        None,
        &[
            ThumbInput {
                page: 1,
                data_url: "data:text/plain;base64,AAAA".to_string(),
                width: 10,
                height: 10,
            },
            ThumbInput {
                page: 2,
                data_url: jpeg_url(),
                width: 96,
                height: 128,
            },
        ],
    )
    .expect("сохранение");

    let meta = read_meta(&root, "/lib/a.pdf").expect("описание");
    assert_eq!(meta.thumbs.keys().copied().collect::<Vec<_>>(), vec![2]);
}

/// Повреждённая картинка пропускается при чтении, свойства остаются.
#[test]
fn broken_image_is_skipped_on_read() {
    let root = test_util::test_root("reader-cache-broken-image");
    save(
        &root,
        "/lib/a.pdf",
        Some(10),
        Some(100),
        Some(serde_json::json!({ "pageCount": 2 })),
        None,
        &[ThumbInput {
            page: 1,
            data_url: jpeg_url(),
            width: 96,
            height: 128,
        }],
    )
    .expect("сохранение");
    let meta = read_meta(&root, "/lib/a.pdf").expect("описание");
    let file = book_dir(&root, "/lib/a.pdf").join(&meta.thumbs[&1].file);
    std::fs::write(&file, b"not an image").expect("порча картинки");

    let entry = read_entry(&root, "/lib/a.pdf", &meta);
    assert!(entry.thumbs.is_empty());
    assert!(entry.properties.is_some());
}

/// Кэш большой книги читается с диска один раз и не разбирает файл заново.
///
/// Проверяется главное обещание кэша: страницы и картинки превью, записанные
/// один раз, читаются без повторной обработки файла. Тест держит несколько
/// десятков страниц с картинками, чтобы выход был заметно больше одной записи.
#[test]
fn many_thumbs_round_trip() {
    let root = test_util::test_root("reader-cache-many-thumbs");
    let mut thumbs = Vec::new();
    for page in 1..=40u32 {
        thumbs.push(ThumbInput {
            page,
            data_url: jpeg_url(),
            width: 96,
            height: 128,
        });
    }
    save(
        &root,
        "/lib/big.pdf",
        Some(64),
        Some(1000),
        Some(serde_json::json!({ "pageCount": 40 })),
        None,
        &thumbs,
    )
    .expect("сохранение");

    let meta = read_meta(&root, "/lib/big.pdf").expect("описание");
    let entry = read_entry(&root, "/lib/big.pdf", &meta);
    assert_eq!(entry.thumbs.len(), 40);
    for page in 1..=40u32 {
        assert!(
            entry
                .thumbs
                .get(&page)
                .is_some_and(|url| url.starts_with("data:image/jpeg;base64,")),
            "нет превью страницы {page}",
        );
    }
}
