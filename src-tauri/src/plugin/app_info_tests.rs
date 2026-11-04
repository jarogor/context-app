//! Тесты сведений о приложении.

use std::path::Path;

use super::*;

#[test]
fn exposes_data_and_log_locations() {
    let info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/context"));

    assert_eq!(info.name, "Контекст");
    assert_eq!(info.version, "0.1.0");
    // Два расположения: каталог данных и файл журнала, который пользователь
    // прикладывает к обращению.
    assert_eq!(info.paths.len(), 2);
    assert_eq!(info.paths[0].key, "app_data");
    assert_eq!(info.paths[1].key, "diagnostics");
    assert!(
        info.paths[1].path.ends_with("diagnostics.log"),
        "путь журнала ведёт к файлу: {}",
        info.paths[1].path
    );
    assert_eq!(info.paths[0].path, "/data/context");
    assert!(info.paths[1].path.contains("app-state"));
    // Заголовок и пояснение — ключи словаря интерфейса: текст показывается на
    // выбранном языке, а ядро от языка не зависит.
    assert_eq!(info.paths[0].title, "app.settings.data.title");
    assert_eq!(info.paths[0].note, "app.settings.data.note");
    assert_eq!(info.paths[1].title, "app.settings.logs.title");
}

#[test]
fn name_follows_the_interface_language() {
    // Имя — текст интерфейса: ядро перевода не хранит, а принимает готовое имя
    // от оболочки. Расположения при этом не меняются.
    let mut info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/context"));
    info.set_name("Context");

    assert_eq!(info.name, "Context");
    assert_eq!(info.paths.len(), 2);
    assert_eq!(info.paths[0].path, "/data/context");
    assert!(info.paths[1].path.contains("app-state"));
}

#[test]
fn shows_no_plugin_jargon_or_levels() {
    // Пользователю не показывают техническое деление плагинов: «каркас»,
    // «приложение», «служебные», «в поставке» — это внутренние понятия.
    let info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/context"));

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
fn every_path_has_title_and_path() {
    let info = AppInfo::build("Контекст", "0.1.0", Path::new("/data/context"));
    for path in &info.paths {
        assert!(!path.title.trim().is_empty(), "{}: нет названия", path.key);
        assert!(!path.path.trim().is_empty(), "{}: пустой путь", path.key);
    }
}

/// Размер каталога считается целиком, включая вложенные папки.
#[test]
fn reports_directory_and_log_size() {
    let root = crate::test_util::test_root("app-info-size");
    crate::test_util::cleanup(&root);
    let state = root.join("app-state");
    let nested = state.join("base-plugins");
    std::fs::create_dir_all(&nested).expect("каталог состояния");
    // 100 байт в корне и 50 во вложенном каталоге: размер каталога считается
    // целиком, а не только по верхнему уровню.
    std::fs::write(root.join("settings.json"), vec![b'a'; 100]).expect("файл");
    std::fs::write(nested.join("values.json"), vec![b'c'; 50]).expect("файл состояния");
    // Журнал лежит прямо в каталоге состояния: его путь проверяет сведения.
    let log = state.join(crate::plugin::diagnostics::DIAGNOSTICS_FILE_NAME);
    std::fs::write(&log, vec![b'b'; 250]).expect("журнал");

    let info = AppInfo::build("Контекст", "0.1.0", &root);

    let data = info.paths.iter().find(|path| path.key == "app_data").expect("данные");
    let size = data.size_bytes.expect("размер каталога");
    assert!(size >= 400, "каталог посчитан целиком: {size}");
    let logs = info.paths.iter().find(|path| path.key == "diagnostics").expect("журнал");
    assert_eq!(logs.size_bytes, Some(250), "размер журнала");

    crate::test_util::cleanup(&root);
}

/// Отсутствующий журнал не даёт размера, а не нуля: ноль означал бы пустой файл.
#[test]
fn missing_file_has_no_size() {
    let root = crate::test_util::test_root("app-info-missing");
    crate::test_util::cleanup(&root);
    std::fs::create_dir_all(&root).expect("каталог");

    let info = AppInfo::build("Контекст", "0.1.0", &root);

    let logs = info.paths.iter().find(|path| path.key == "diagnostics").expect("журнал");
    assert_eq!(logs.size_bytes, None, "нет файла — нет размера");
    crate::test_util::cleanup(&root);
}

/// Жёсткие ссылки не считаются дважды: блоки у них общие.
#[cfg(unix)]
#[test]
fn counts_hard_links_once() {
    // Кеш webview держит одни и те же блоки под десятками имён. Подсчёт по
    // путям давал заметно больше реально занятого места (1,1 ГБ против 864 МБ).
    let root = crate::test_util::test_root("app-info-hard-links");
    crate::test_util::cleanup(&root);
    std::fs::create_dir_all(&root).expect("каталог");
    let data = vec![b'x'; 64 * 1024];
    let original = root.join("blob");
    std::fs::write(&original, &data).expect("файл");
    // Пять жёстких ссылок на тот же файл: место не увеличивается.
    for index in 1..=5 {
        std::fs::hard_link(&original, root.join(format!("blob-{index}"))).expect("ссылка");
    }

    let info = AppInfo::build("Контекст", "0.1.0", &root);
    let size = info.paths[0].size_bytes.expect("размер каталога");

    // Один файл: около 64 КиБ плюс возможные метаданные, но не в шесть раз
    // больше. Размер берётся по занятым блокам, поэтому проверяется диапазон.
    assert!(
        size < 128 * 1024,
        "жёсткие ссылки учтены один раз: {size} байт"
    );
    assert!(size >= 64 * 1024, "файл учтён: {size} байт");

    crate::test_util::cleanup(&root);
}
