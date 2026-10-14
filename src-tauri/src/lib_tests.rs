//! Тесты расположения служебных каталогов приложения.

use super::*;

/// Состояние базовых плагинов лежит внутри каталога состояния приложения.
#[test]
fn base_plugins_storage_lives_inside_state_root() {
    let state_root = PathBuf::from("/data/app-state");
    let storage = base_storage_root(&state_root);

    assert_eq!(
        storage,
        PathBuf::from("/data/app-state/base-plugins"),
        "состояние базовых плагинов лежит в каталоге состояния"
    );
    assert!(
        storage.starts_with(&state_root),
        "хранилище не выходит за каталог состояния"
    );
}

/// Хранилище базовых плагинов не указывает в каталог разработки.
#[test]
fn base_plugins_storage_is_not_dev_data() {
    let state_root = crate::constants::resolve_app_state_root(None);
    let storage = base_storage_root(&state_root);

    assert_eq!(
        storage,
        state_root.join(BASE_PLUGINS_DIR_NAME),
        "хранилище следует за каталогом состояния текущей сборки"
    );
    assert_ne!(
        storage,
        crate::paths::dev_data_dir().join(BASE_PLUGINS_DIR_NAME),
        "состояние базовых плагинов не лежит в каталоге разработки"
    );
}
