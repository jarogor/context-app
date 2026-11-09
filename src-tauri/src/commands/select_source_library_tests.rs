//! Тесты возврата уже открытой библиотеки.
//!
//! Дефект: библиотеку убирали из списка, а повторное открытие той же библиотеки
//! не возвращало её — «быстрый путь» отдавал ответ, не записав историю. Тест
//! воспроизводит этот сценарий целиком: запись, удаление, повторное открытие.

use super::*;
use crate::plugin::SourceProvider;
use crate::test_util;

/// Идентификатор провайдера тестовой библиотеки.
const PROVIDER: &str = "a692624f-1fa0-49a2-9015-9cb7361f9d47";

/// Имя провайдера тестовой библиотеки.
const PROVIDER_NAME: &str = "books-source";

/// Провайдер, видимый в выдаче истории.
fn provider() -> SourceProvider {
    SourceProvider {
        id: PROVIDER.to_string(),
        name: PROVIDER_NAME.to_string(),
    }
}

/// Повторное открытие возвращает удалённую из списка библиотеку.
#[test]
fn reuse_restores_forgotten_library() {
    let root = test_util::test_root("select-reuse-restores");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    let path = library.to_str().expect("путь библиотеки").to_string();

    library_history::remember(&root, &path, PROVIDER).expect("запись");
    library_history::forget(&root, &path).expect("удаление");
    let after_forget = library_history::list(&root, &[provider()], &[]).expect("список");
    assert!(after_forget.is_empty(), "удалённая запись скрыта из списка");

    reuse_active_library(Path::new(&root), &path, PROVIDER, PROVIDER_NAME)
        .expect("повторное открытие");

    let after_reuse = library_history::list(&root, &[provider()], &[]).expect("список");
    assert_eq!(
        after_reuse.len(),
        1,
        "повторное открытие возвращает библиотеку в список"
    );
    assert_eq!(after_reuse[0].path, path);
    assert_eq!(after_reuse[0].provider, PROVIDER);
    test_util::cleanup(&root);
}

/// Повторное открытие отвечает теми же провайдером и именем и помечает переиспользование.
#[test]
fn reuse_returns_active_provider_identity() {
    let root = test_util::test_root("select-reuse-identity");
    let library = root.join("lib");
    std::fs::create_dir_all(&library).expect("библиотека");
    let path = library.to_str().expect("путь библиотеки").to_string();

    let response = reuse_active_library(Path::new(&root), &path, PROVIDER, PROVIDER_NAME)
        .expect("повторное открытие");

    assert_eq!(response["provider"], PROVIDER);
    assert_eq!(response["provider_name"], PROVIDER_NAME);
    assert_eq!(response["reused"], true, "переоткрытия не было");
    test_util::cleanup(&root);
}

/// Повторное открытие поднимает запись наверх, не оставляя дубликата.
#[test]
fn reuse_moves_entry_to_top_without_duplicates() {
    let root = test_util::test_root("select-reuse-order");
    let first = root.join("first");
    let second = root.join("second");
    std::fs::create_dir_all(&first).expect("первая библиотека");
    std::fs::create_dir_all(&second).expect("вторая библиотека");

    library_history::remember(&root, first.to_str().unwrap(), PROVIDER).expect("первая");
    library_history::remember(&root, second.to_str().unwrap(), PROVIDER).expect("вторая");
    reuse_active_library(
        Path::new(&root),
        first.to_str().unwrap(),
        PROVIDER,
        PROVIDER_NAME,
    )
    .expect("повторное открытие");

    let entries = library_history::list(&root, &[provider()], &[]).expect("список");
    assert_eq!(entries.len(), 2, "дубликата нет");
    assert_eq!(
        entries[0].path,
        first.to_str().unwrap(),
        "повторно открытая запись стоит первой"
    );
    test_util::cleanup(&root);
}
