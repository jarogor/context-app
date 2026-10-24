//! Тесты сведений о приложении.

use std::path::Path;

use super::*;

#[test]
fn exposes_single_state_location() {
    let info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/app-state"));

    assert_eq!(info.name, "Контекст");
    assert_eq!(info.version, "0.1.0");
    // Пользователю показывается одно расположение — каталог состояния.
    assert_eq!(info.paths.len(), 1);
    assert_eq!(info.paths[0].key, "app_state");
    assert_eq!(info.paths[0].path, "/data/app-state");
    assert_eq!(info.paths[0].title, "Состояние приложения");
}

#[test]
fn shows_no_plugin_jargon_or_levels() {
    // Пользователю не показывают техническое деление плагинов: «каркас»,
    // «приложение», «служебные», «в поставке» — это внутренние понятия.
    let info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/app-state"));

    for path in &info.paths {
        let text = format!("{} {}", path.title, path.note).to_lowercase();
        for banned in [
            "каркас",
            "поставке",
            "уровн",
            "служебн",
            "webview",
            "кеш плагин",
        ] {
            assert!(
                !text.contains(banned),
                "{}: жаргон «{banned}» в \"{}\"",
                path.key,
                path.title
            );
        }
    }
}

#[test]
fn every_path_has_title_and_note() {
    let info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/app-state"));
    for path in &info.paths {
        assert!(!path.title.trim().is_empty(), "{}: нет названия", path.key);
        assert!(!path.note.trim().is_empty(), "{}: нет пояснения", path.key);
        assert!(!path.path.trim().is_empty(), "{}: пустой путь", path.key);
    }
}
