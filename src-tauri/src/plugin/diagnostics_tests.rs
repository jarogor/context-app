//! Тесты файлового журнала диагностики.

use super::*;

#[test]
fn line_has_time_severity_source_and_message() {
    let line = format_line(
        Severity::Warn,
        "Плагин пропущен: нет модуля",
        "core",
        &serde_json::json!({ "dir": "/plugins" }),
    );

    // Время в UTC, важность, источник, текст и подробности — в одной строке.
    assert!(line.ends_with('\n'), "строка завершается переводом строки");
    assert!(line.contains(" WARN  [core] Плагин пропущен: нет модуля"));
    assert!(line.contains(r#"{"dir":"/plugins"}"#));
    assert!(line.starts_with("20"), "время впереди: {line}");
}

#[test]
fn line_omits_empty_details() {
    let line = format_line(Severity::Info, "Готово", "core", &serde_json::json!({}));
    assert!(
        line.trim_end().ends_with("Готово"),
        "без лишних скобок: {line}"
    );
}

#[test]
fn severity_names_are_stable() {
    // По этим именам поддержка ищет ошибки в отчёте, поэтому они не меняются
    // при правке формулировок интерфейса.
    assert_eq!(severity_name(Severity::Error), "ERROR");
    assert_eq!(severity_name(Severity::Warn), "WARN");
    assert_eq!(severity_name(Severity::Info), "INFO");
    assert_eq!(severity_name(Severity::Debug), "DEBUG");
    assert_eq!(severity_name(Severity::Trace), "TRACE");
}

#[test]
fn timestamp_is_utc_with_milliseconds() {
    let stamp = utc_timestamp();
    // Вид: 2026-11-01T12:34:56.789Z — без локали машины.
    assert_eq!(stamp.len(), 24, "длина метки: {stamp}");
    assert!(stamp.ends_with('Z'), "метка в UTC: {stamp}");
    assert_eq!(&stamp[4..5], "-");
    assert_eq!(&stamp[10..11], "T");
}

#[test]
fn civil_date_matches_known_days() {
    // Эпоха и известные даты: преобразование не зависит от часового пояса.
    assert_eq!(civil_from_days(0), (1970, 1, 1));
    assert_eq!(civil_from_days(19_000), (2022, 1, 8));
}

#[test]
fn rotation_keeps_the_tail_and_whole_lines() {
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("diagnostics.log");
    let line = format!("{} INFO  [core] событие\n", "x".repeat(80));
    // Наполняем файл сверх предела, чтобы сработало вытеснение.
    let mut content = String::new();
    while content.len() as u64 <= MAX_BYTES {
        content.push_str(&line);
    }
    std::fs::write(&path, &content).expect("запись журнала");

    append(&path, "свежее событие\n").expect("дописывание");

    let after = std::fs::read_to_string(&path).expect("чтение журнала");
    assert!(
        after.len() as u64 <= MAX_BYTES,
        "журнал ограничен по размеру: {}",
        after.len()
    );
    assert!(
        after.ends_with("свежее событие\n"),
        "новое событие на месте"
    );
    // Обрезанных строк нет: каждая полная — начинается с метки времени и
    // содержит источник, как её пишет `format_line`.
    for line in after.lines() {
        if line == "свежее событие" {
            continue;
        }
        assert!(line.contains(" INFO  [core] "), "обрезанная строка: {line}");
    }
}

#[test]
fn rotation_does_not_split_multibyte_characters() {
    // Журнал пишется по-русски, и середина файла легко попадает внутрь
    // многобайтного символа. Срез по такому смещению паникует, поэтому граница
    // вытеснения обязана быть границей символа.
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("diagnostics.log");
    let line = "2026-11-04T18:01:31.281Z INFO  [core] Плагин загружен: формат — проверка\n";
    // Сдвиг в три байта ставит половину файла внутрь символа «П»: без
    // выравнивания по границе символа срез паникует.
    let mut content = String::from("그\n");
    while content.len() as u64 <= MAX_BYTES {
        content.push_str(line);
    }
    // Проверка условия теста: смещение действительно рвёт символ.
    let keep_from = (content.len() as f64 * (1.0 - KEEP_RATIO)) as usize;
    assert!(
        !content.is_char_boundary(keep_from),
        "смещение должно попадать внутрь символа, иначе тест ничего не ловит"
    );
    std::fs::write(&path, &content).expect("запись журнала");

    rotate(&path).expect("вытеснение без паники");

    let after = std::fs::read_to_string(&path).expect("журнал остаётся текстом UTF-8");
    assert!(
        after.len() as u64 <= MAX_BYTES,
        "журнал ограничен по размеру: {}",
        after.len()
    );
    assert!(!after.is_empty(), "журнал не обнуляется целиком");
    // Первая строка — целая запись, а не обрывок посреди символа.
    let first = after.lines().next().expect("первая строка");
    assert!(
        first.starts_with("2026-"),
        "вытеснение начинается с целой строки: {first}"
    );
}

#[test]
fn repeated_appends_stay_bounded_and_never_panic() {
    // Журнал кольцевой: он дописывается постоянно, но не растёт бесконечно.
    // Проверяются обе стороны — размер остаётся в пределе, а вытеснение не
    // рвётся на кириллице и не прекращает запись.
    let dir = tempfile::tempdir().expect("временный каталог");
    let path = dir.path().join("diagnostics.log");
    let line = format_line(
        Severity::Info,
        "Плагин загружен: format-epub",
        "core",
        &serde_json::json!({ "id": "2f4c8a10-9b3d-4e6f-8a71-5c0d2e3f4a5b" }),
    );

    // Событий заведомо больше, чем помещается в журнал: без вытеснения файл
    // вырос бы втрое.
    let count = (MAX_BYTES as usize / line.len()) * 3;
    for _ in 0..count {
        append(&path, &line).expect("дописывание журнала");
    }

    let size = std::fs::metadata(&path).expect("файл журнала").len();
    assert!(
        size <= MAX_BYTES,
        "журнал ограничен {MAX_BYTES} байтами, а вырос до {size}"
    );
    let content = std::fs::read_to_string(&path).expect("журнал остаётся текстом UTF-8");
    assert!(!content.is_empty(), "журнал не пустеет после вытеснения");
    // Каждая строка целая: вытеснение режет по границам строк, а не по байтам.
    for line in content.lines() {
        assert!(
            line.starts_with("20") && line.contains("INFO  [core]"),
            "обрезанная строка: {line}"
        );
    }
}

#[test]
fn record_goes_to_the_configured_file() {
    // Журнал перенаправляется в свой каталог: файл один на процесс, но проверка
    // должна видеть только свои записи.
    let dir = tempfile::tempdir().expect("временный каталог");
    init(dir.path());
    record(
        Severity::Warn,
        "Плагин пропущен",
        "core",
        &serde_json::json!({ "dir": "/plugins" }),
    );

    let content = read().expect("журнал прочитан");
    assert!(content.contains("WARN"), "важность в журнале: {content}");
    assert!(content.contains("Плагин пропущен"), "текст в журнале");
    assert!(is_ready(), "журнал настроен");
    assert!(path().is_some(), "путь известен");
}
