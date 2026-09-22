## 1. Модель и реестр плагина настроек

- [x] 1.1 Заменить `SectionSchema.defaults` на `fields: Vec<FieldSchema>` с `key`, `title`, `type`, `description`, `default`, `options`; добавить перечисление/константы типов и `RegisteredSection.fields`; покрыть `registry_tests.rs` тестом метаданных полей
- [x] 1.2 Вычислять значения по умолчанию из полей (включая значение по типу, `select` — первый вариант, неизвестный тип → `json`); покрыть `store_tests.rs`
- [x] 1.3 Возвращать `fields` в `sections_with_values()` и в ответах `register`/`list`; обновить `lib_tests.rs` проверками метаданных и значений по умолчанию
- [x] 1.4 Проверить `cargo test --manifest-path src-wasm-plugins/Cargo.toml -p settings`

## 2. Декларации приложения и уведомлений

- [x] 2.1 Перевести `APP_SETTINGS_SCHEMA` в `plugin/app_host.rs` на `fields` с названием «Приветственное уведомление при запуске»; проверить `cargo test --manifest-path src-tauri/Cargo.toml plugin::app_host`
- [x] 2.2 Перевести декларацию `notifications` в `scripts/build-wasm-plugins.sh` на `fields` с названием «Показывать технические уведомления»; проверить `scripts/build-wasm-plugins.sh` и содержимое манифеста

## 3. UI настроек

- [x] 3.1 Добавить в `plugins/settings-ui/src/types.ts` типы `Field`/`FieldOption`/`FieldType` и `Section.fields`
- [x] 3.2 Переписать `SettingsPage.svelte`: черновики-строки, контролы по типу (checkbox/input/number/select/textarea для json), конвертация и сохранение; убрать JSON-редактор секции
- [x] 3.3 Проверить `npm --prefix plugins/settings-ui run check` и `run build`

## 4. Документация и проверки

- [x] 4.1 Обновить `_docs/settings.md` (формат `fields`, типы, человекочитаемый UI) и `AGENTS.md` при необходимости
- [x] 4.2 Обновить основную спеку `settings`; проверить `openspec validate --all`
- [x] 4.3 Выполнить `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- [x] 4.4 Выполнить `npm run check`, `npm run build`; проверить страницу настроек с типизированными полями
