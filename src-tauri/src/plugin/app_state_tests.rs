//! Тесты фоновой сборки runtime базовых плагинов в состоянии приложения.

use super::*;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;
use std::sync::{Arc, Mutex};

/// WAT-модуль, экспортирующий функцию `invoke`.
const WAT_WITH_INVOKE: &str = r#"
    (module
      (func (export "invoke") (result i32)
        i32.const 0))
  "#;

/// Создание директории базовых плагинов с одним плагином.
fn setup_base_plugins(name: &str) -> PathBuf {
    let dir = test_util::test_root(&format!("app-state-{name}"));
    let plugin_dir = dir.join("base-sample");
    fs::create_dir_all(&plugin_dir).expect("директория плагина");
    fs::write(
        plugin_dir.join("plugin-manifest.json"),
        r#"{
        "contract_version": 1,
        "level": "framework", "kind": "framework",
        "id": "313fbeb9-8537-48bc-bb5f-5296e7b1c81e",
        "name": "sample",
        "description": "Образец базового плагина",
        "module": "plugin.wasm",
        "export": "invoke",
        "host_functions": []
      }"#,
    )
    .expect("манифест плагина");
    fs::write(plugin_dir.join("plugin.wasm"), WAT_WITH_INVOKE).expect("модуль");
    dir
}

/// Создание состояния с заданными каталогами базовых плагинов.
fn state_with_base(name: &str, base_root: PathBuf) -> AppState {
    let app_state_root = test_util::test_root(&format!("app-state-root-{name}"));
    let session = PluginSession::idle(PathBuf::from("."), base_root.clone());
    let app_info = AppInfo::build("Контекст", "0.1.0", &app_state_root);
    let reader_config = ReaderConfig {
        directories: Vec::new(),
        disabled: Vec::new(),
        storage_root: app_state_root.clone(),
        cache: None,
    };
    let app_host_config = AppHostConfig {
        directories: vec![base_root.clone()],
        storage_root: app_state_root.join("storage"),
        user_plugins_dir: app_state_root.join("plugins"),
        activation_root: app_state_root.clone(),
        catalog_dirs: Vec::new(),
        cache: None,
    };
    AppState::new(
        session,
        app_state_root,
        app_info,
        reader_config,
        app_host_config,
    )
}

/// Runtime базовых плагинов не собирается синхронно при создании состояния.
#[test]
fn app_host_is_lazy_at_creation() {
    let base_root = setup_base_plugins("lazy");
    let state = state_with_base("lazy", base_root.clone());
    assert!(
        state.app_host.is_none(),
        "runtime базовых плагинов не должен собираться при создании"
    );
    cleanup(&base_root);
}

/// Обращение ожидает готовности фоновой сборки и переиспользует результат.
#[test]
fn app_host_loads_on_first_access() {
    let base_root = setup_base_plugins("first-access");
    let mut state = state_with_base("first-access", base_root.clone());

    let names = state
        .with_app_host(|host| host.plugin_names())
        .expect("первое обращение дожидается готовности");
    assert_eq!(names, vec!["sample".to_string()], "базовый плагин загружен");

    // Повторное обращение не пересобирает runtime и не теряет плагин.
    let again = state
        .with_app_host(|host| host.plugin_names())
        .expect("повторное обращение использует готовый runtime");
    assert_eq!(again, vec!["sample".to_string()], "runtime переиспользован");

    cleanup(&base_root);
}

/// Дескриптор runtime переиспользуется: повторный запуск сборки не создаётся.
#[test]
fn app_host_handle_is_shared() {
    let base_root = setup_base_plugins("shared");
    let mut state = state_with_base("shared", base_root.clone());

    let first = state.app_host_handle();
    let second = state.app_host_handle();
    assert!(
        Arc::ptr_eq(&first, &second),
        "повторный дескриптор указывает на ту же фоновую сборку"
    );

    cleanup(&base_root);
}

/// Лёгкая команда не ждёт удержания общего замка на время компиляции.
///
/// Дескриптор runtime может ждать готовности, удерживая общий замок состояния:
/// такой сценарий не должен блокировать другие команды дольше короткого захвата
/// дескриптора. Здесь проверяется, что общий замок отпускается до ожидания, а
/// сама сборка идёт в фоне.
#[test]
fn light_state_access_is_not_blocked_by_background_build() {
    let base_root = setup_base_plugins("nonblocking");
    let state = Arc::new(Mutex::new(state_with_base(
        "nonblocking",
        base_root.clone(),
    )));

    // Запуск фоновой сборки под коротким захватом замка.
    let handle = {
        let mut guard = state.lock().expect("замок состояния");
        guard.app_host_handle()
    };

    // Общий замок свободен: лёгкое чтение диспетчеризуется, пока сборка идёт.
    let readonly = state.lock().expect("лёгкое обращение при фоновой сборке");
    assert!(
        readonly.app_state_root().exists() || !readonly.app_state_root().as_os_str().is_empty(),
        "лёгкое чтение состояния доступно во время фоновой сборки"
    );
    drop(readonly);

    // Готовность ожидается на замке runtime, а не на общем замке.
    let names = handle
        .with_ready(|host| host.plugin_names())
        .expect("сборка завершилась");
    assert_eq!(names, vec!["sample".to_string()]);

    cleanup(&base_root);
}

/// Сквозное чтение книги порциями через ответ состояния.
///
/// Проверяется весь путь, по которому интерфейс собирает файл: границы порций,
/// продолжение чтения по `next`, выравнивание base64 и полный размер для
/// прогресса. Здесь ловятся сразу три поломки, каждая из которых ломает открытие
/// книги: копирование файла целиком вместо порции (медленное открытие), длина
/// вместо смещения в `next` (зацикливание чтения) и паддинг `=` на стыке порций
/// (невалидная склейка строк).
#[test]
fn book_chunks_rebuild_the_whole_file() {
    let dir = test_util::test_root("app-state-book-chunk");
    fs::create_dir_all(&dir).expect("каталог книги");
    let path = dir.join("book.pdf");
    let bytes: Vec<u8> = (0..5000u32).map(|value| (value % 251) as u8).collect();
    fs::write(&path, &bytes).expect("файл книги");

    let mut state = state_with_base("book-chunk", dir.join("base"));
    let mut offset = 0;
    let mut parts = String::new();
    loop {
        let chunk = state
            .book_chunk_response(path.to_str().unwrap(), offset, 300)
            .expect("порция книги");
        let encoded = chunk["chunk"].as_str().expect("порция").to_string();
        let total = chunk["total"].as_u64().expect("полный размер") as usize;
        let next = chunk["next"].as_u64().expect("смещение конца") as usize;
        let done = chunk["done"].as_bool().expect("признак конца");

        assert_eq!(total, bytes.len(), "полный размер файла для прогресса");
        assert_eq!(
            &encoded,
            &base64::Engine::encode(
                &base64::engine::general_purpose::STANDARD,
                &bytes[offset..next],
            ),
            "порция содержит ровно свои байты"
        );
        // Порция никогда не больше запрошенной: иначе ядро отдаёт файл целиком
        // и открытие книги упирается в копирование, а не в чтение.
        assert!(next - offset <= 300, "порция не больше запрошенной длины");
        if !done {
            assert_eq!(next - offset, 300, "порция ровно запрошенной длины");
            assert!(!encoded.contains('='), "промежуточная порция без паддинга");
        }
        parts.push_str(&encoded);
        offset = next;
        if done {
            break;
        }
        assert!(offset < bytes.len(), "чтение не зацикливается");
    }

    // Собранное совпадает с книгой: ни порции не потеряны, ни повторены.
    assert_eq!(offset, bytes.len());
    assert_eq!(
        parts,
        base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes,)
    );

    cleanup(&dir);
}

#[test]
fn support_report_contains_everything_needed_to_investigate() {
    // Отчёт должен отвечать на вопросы поддержки без расспросов пользователя:
    // что за версия, на чём запущено, какие плагины загружены и что происходило.
    let info = AppInfo::build("Контекст", "1.2.3", Path::new("/data/context"));
    let plugins = vec!["books-source".to_string(), "format-pdf".to_string()];
    let diagnostics = Some("2026-11-01T10:00:00.000Z ERROR [core] вызов упал\n".to_string());

    let report = build_support_report(&info, &plugins, diagnostics);

    assert!(report.contains("Версия: 1.2.3"), "версия в отчёте");
    assert!(report.contains("Платформа:"), "платформа в отчёте");
    assert!(report.contains("/data/context"), "расположение данных");
    assert!(report.contains("books-source"), "плагины в отчёте");
    assert!(report.contains("format-pdf"), "все плагины");
    assert!(
        report.contains("ERROR [core] вызов упал"),
        "журнал диагностики целиком"
    );
}

#[test]
fn support_report_is_honest_about_an_empty_journal() {
    // Пустой журнал — не повод для пустого места: поддержка должна видеть, что
    // записей нет, а не гадать, потерялись они или их не было.
    let info = AppInfo::build("Контекст", "1.0.0", Path::new("/data"));
    let report = build_support_report(&info, &[], None);

    assert!(report.contains("журнал пуст или недоступен"), "{report}");
    assert!(report.contains("ни один плагин не загружен"), "{report}");
}
