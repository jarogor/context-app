use super::*;

use std::path::PathBuf;

use serde_json::Value;

/// Корень репозитория: схемы и примеры лежат рядом с крейтом ядра.
fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..")
}

/// Чтение JSON-файла репозитория.
fn read_json(path: &PathBuf) -> Value {
    let text = std::fs::read_to_string(path).unwrap_or_else(|error| {
        panic!("файл {} не читается: {error}", path.display());
    });
    serde_json::from_str(&text)
        .unwrap_or_else(|error| panic!("файл {} не разбирается: {error}", path.display()))
}

/// Пример документа указанной версии: `schemas/v<N>/examples/<вид>.json`.
fn example(kind: &DocumentKind, version: u32) -> Value {
    read_json(
        &repo_root()
            .join("schemas")
            .join(format!("v{version}"))
            .join("examples")
            .join(format!("{}.json", kind.schema_name)),
    )
}

#[test]
fn registry_marks_are_unique() {
    // Документы с номером контракта опознаются по имени файла, а не по метке:
    // у них строковой метки нет, поэтому сравниваются только метки формата.
    for (index, kind) in ALL.iter().enumerate() {
        let Some(marker) = kind.marker() else {
            continue;
        };
        for other in ALL.iter().skip(index + 1) {
            assert_ne!(
                Some(marker),
                other.marker(),
                "метка `{marker}` повторяется у {} и {}",
                kind.schema_name,
                other.schema_name
            );
        }
    }
}

#[test]
fn schema_ids_match_registry() {
    for kind in ALL {
        for version in kind.versions {
            let schema: Value = serde_json::from_str(version.schema).unwrap_or_else(|error| {
                panic!(
                    "схема {} версии {} не разбирается: {error}",
                    kind.schema_name, version.version
                )
            });
            assert_eq!(
                schema["$schema"], "https://json-schema.org/draft/2020-12/schema",
                "схема {} объявляет черновик JSON Schema",
                kind.schema_name
            );
            assert_eq!(
                schema["$id"],
                format!(
                    "https://context.app/schemas/v{}/{}.schema.json",
                    version.version, kind.schema_name
                ),
                "идентификатор схемы {} версии {}",
                kind.schema_name,
                version.version
            );
            assert!(
                schema["title"].is_string() && schema["description"].is_string(),
                "у схемы {} есть заголовок и описание",
                kind.schema_name
            );
        }
    }
}

#[test]
fn versions_are_ordered_and_chained() {
    for kind in ALL {
        let mut previous = 0;
        for (index, version) in kind.versions.iter().enumerate() {
            assert!(
                version.version > previous,
                "версии {} идут по возрастанию",
                kind.schema_name
            );
            let is_current = index + 1 == kind.versions.len();
            assert_eq!(
                version.upgrade.is_some(),
                !is_current,
                "у {} версия {} {} приведение к следующей",
                kind.schema_name,
                version.version,
                if is_current {
                    "не имеет"
                } else {
                    "имеет"
                }
            );
            previous = version.version;
        }
        assert_eq!(
            kind.current_version(),
            kind.versions.last().expect("версии").version,
            "текущая версия {} — последняя в цепочке",
            kind.schema_name
        );
    }
}

#[test]
fn examples_match_schemas_and_marks() {
    for kind in ALL {
        for version in kind.versions {
            let document = example(kind, version.version);
            schema::validate_text(&document, version.schema, kind.schema_name).unwrap_or_else(
                |error| {
                    panic!(
                        "пример {} версии {} не соответствует схеме: {error}",
                        kind.schema_name, version.version
                    )
                },
            );

            if kind.is_contract() {
                assert_eq!(
                    document["contract_version"], version.version,
                    "пример {} несёт версию контракта",
                    kind.schema_name
                );
            } else {
                assert_eq!(
                    document["format"], kind.format,
                    "пример {} несёт метку формата",
                    kind.schema_name
                );
                assert_eq!(
                    document["version"], version.version,
                    "пример {} несёт версию своей схемы",
                    kind.schema_name
                );
            }
        }
    }
}

#[test]
fn example_with_foreign_mark_is_rejected() {
    for kind in ALL.iter().filter(|kind| !kind.is_contract()) {
        let version = kind.first();
        let mut document = example(kind, version.version);
        document["format"] = Value::String("context.other".to_string());
        let error = schema::validate_text(&document, version.schema, kind.schema_name)
            .expect_err("чужая метка не проходит схему");
        assert!(
            error.contains("ожидается"),
            "схема {} отвергает чужую метку: {error}",
            kind.schema_name
        );
    }
}

#[test]
fn repository_manifests_match_schema() {
    let plugins = repo_root().join("src-wasm-plugins");
    let mut checked = 0;
    for entry in std::fs::read_dir(&plugins)
        .expect("каталог плагинов")
        .flatten()
    {
        let manifest = entry.path().join("plugin-manifest.json");
        if !manifest.is_file() {
            continue;
        }
        let document = read_json(&manifest);
        schema::validate_text(
            &document,
            PLUGIN_MANIFEST.current_schema(),
            "plugin-manifest",
        )
        .unwrap_or_else(|error| {
            panic!(
                "манифест {} не соответствует схеме: {error}",
                manifest.display()
            )
        });
        checked += 1;
    }
    assert!(checked > 0, "найдены манифесты плагинов");
}

#[test]
fn plugin_state_documents_follow_their_schemas() {
    // Состояния плагинов пишут сами плагины; здесь проверяется, что объявленные
    // схемы описывают ровно те документы, которые они сохраняют.
    for kind in [&NOTES_STATE, &SETTINGS_STATE, &PLUGIN_STORE_STATE] {
        let document = example(kind, kind.current_version());
        schema::validate_text(&document, kind.current_schema(), kind.schema_name).unwrap_or_else(
            |error| {
                panic!(
                    "пример {} не соответствует схеме: {error}",
                    kind.schema_name
                )
            },
        );
    }
}

#[test]
fn owners_cover_every_document() {
    let counts = ALL.iter().fold([0usize; 4], |mut counts, kind| {
        let index = match kind.owner {
            Owner::Core => 0,
            Owner::Framework => 1,
            Owner::Plugin => 2,
            Owner::External => 3,
        };
        counts[index] += 1;
        counts
    });
    assert!(counts[0] >= 6, "документы ядра описаны");
    assert_eq!(counts[1], 1, "манифест плагина");
    assert_eq!(counts[2], 4, "состояния плагинов и перенос набора");
    assert_eq!(counts[3], 1, "индекс обновлений");
}

#[test]
fn core_documents_are_written_with_mark_and_version() {
    // Проверка сквозная: модули ядра пишут файлы через реестр документов, поэтому
    // каждый служебный файл несёт метку формата и версию.
    let dir = std::env::temp_dir().join("context-documents-marks");
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).expect("каталог");

    crate::workspace_state::save(&dir, &crate::workspace_state::WorkspacesFile::default())
        .expect("реестр рабочих мест");
    crate::library_history::remember(&dir, "/lib", "books-source").expect("история библиотек");
    crate::plugin::cover_cache::CoverCache::default()
        .save(&dir)
        .expect("кэш обложек");
    crate::plugin::activation::save(&dir, &[]).expect("отключённые плагины");
    crate::update::state::save(&dir, &crate::update::state::PersistedUpdate::default())
        .expect("состояние обновлений");
    crate::reader_cache::save(&dir, "/lib/Книга.pdf", Some(1), Some(1), None, None, &[])
        .expect("кэш свойств");

    let expected = [
        ("workspaces.json", "context.workspaces"),
        ("library-history.json", "context.library-history"),
        ("cover-cache.json", "context.cover-cache"),
        ("disabled-plugins.json", "context.disabled-plugins"),
        ("updates.json", "context.updates"),
    ];
    for (file, format) in expected {
        let document = read_json(&dir.join(file));
        assert_eq!(document["format"], format, "метка файла {file}");
        assert_eq!(document["version"], 1, "версия файла {file}");
    }

    // Кэш свойств лежит в подкаталоге по хэшу пути: app-state/reader-cache/<хэш>.
    let cache_dir = dir.join("reader-cache");
    let mut meta = None;
    for entry in std::fs::read_dir(&cache_dir)
        .expect("каталог кэша")
        .flatten()
    {
        let candidate = entry.path().join("meta.json");
        if candidate.is_file() {
            meta = Some(read_json(&candidate));
            break;
        }
    }
    let meta = meta.expect("кэш свойств записан");
    assert_eq!(meta["format"], "context.reader-cache");
    assert_eq!(meta["version"], 1);
}
