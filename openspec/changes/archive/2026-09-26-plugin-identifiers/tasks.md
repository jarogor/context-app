## 1. Манифест и сборка

- [x] 1.1 Добавить зависимость `uuid` в `src-tauri/Cargo.toml` и убедиться, что сборка `cargo build --manifest-path src-tauri/Cargo.toml` проходит
- [x] 1.2 Добавить обязательное поле `id: String` в `PluginManifest` с проверкой `uuid::Uuid::parse_str` в `validate`; `name` оставить подписью; обновить `plugin_manifest_tests.rs` (валидный id, отсутствующий id, некорректный id) и прогнать `cargo test --manifest-path src-tauri/Cargo.toml plugin_manifest`
- [x] 1.3 Прокинуть `id` через `LoadedPlugin` (`loaded_plugin.rs`) и использовать его в идентичности `runtime.rs`: дедупликация `seen` по `id`, разрешение зависимостей и владелец capability по `id`, методы поиска/вызова/`probe_priority`/`plugin_for_capability` по `id`; обновить `runtime_tests.rs` и проверить `cargo test --manifest-path src-tauri/Cargo.toml runtime`
- [x] 1.4 Перевести `activation.rs` на хранение и сравнение `id` и фильтр `load_filtered` на `LoadedPlugin.id`; обновить `activation_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml activation`
- [x] 1.5 Перевести `discovery.rs` на пары `(id, name)`: `discover_source_plugins` возвращает id, `PluginEntry` получает `id`, `is_disableable` и `removable` работают по id/расположению в пользовательском каталоге; обновить `discovery_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml discovery`
- [x] 1.6 Обновить `scripts/build-wasm-plugins.sh`: параметр `id` с постоянными UUID для notifications, settings, plugin-store, demo, library, library-calibre; добавить статические `id` в `plugins/*/plugin-manifest.json` и `dev_data/app-plugins/demo/plugin-manifest.json`; проверить `scripts/build-wasm-plugins.sh` и валидность сгенерированных манифестов

## 2. История, источник, настройки

- [x] 2.1 Перевести `library_history.rs` на `provider` = id и добавить `provider_name` в `HistoryEntry` (резолв по discovery); обновить `library_history_tests.rs` и `library_history_list.rs`, прогнать `cargo test --manifest-path src-tauri/Cargo.toml library_history`
- [x] 2.2 Обновить `session.rs`/`commands/select_source_library.rs`: выбор провайдера и активный плагин — по id, ответ открытия содержит id; обновить `session_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml session`
- [x] 2.3 Перевести сборку деклараций настроек (`runtime.rs` `settings_sources`) на `owner = plugin.id`, секцию приложения оставить `app`; убедиться, что `settings-ui` использует `title` и не показывает `owner` как подпись

## 3. Store и пакеты

- [x] 3.1 Перевести `package.rs` на `id`: `InstalledPlugin` с `id`, установка в подкаталог `id`, конфликт и удаление по `id`; обновить `package_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml package`
- [x] 3.2 Обновить привилегированные host-функции `store_uninstall`/`store_set_enabled` и операции `plugin-store` (`lib.rs`, `host.rs`, `wasm.rs`, `models.rs`) на приём `id`; поправить `lib_tests.rs` и прогнать `cargo test --manifest-path src-wasm-plugins/Cargo.toml`

## 4. Frontend

- [x] 4.1 Обновить типы и вызовы `plugins/plugin-store-ui` (`types.ts`, `bridge.ts`, `StorePage.svelte`, `StorePlugin.svelte`): переключатели и удаление по `id`, отображение по `name`; проверить `npm run check`
- [x] 4.2 Обновить `plugins/library-ui` на отображение `provider_name` из истории и открытие по `provider`; проверить `npm run check`
- [x] 4.3 Актуализировать фикстуры `packages/testing/src/fixtures.ts` и e2e-ожидания (`tests/e2e/shell.spec.ts`, `tests/e2e/settings-plugin.spec.ts`) под новые поля; прогнать `npm test` и `npm run test:e2e`

## 5. Проверки

- [x] 5.1 Обновить `_docs/plugin-contract.md` и `_docs/structure.md` (поле `id`, UUID, отсутствие миграции)
- [x] 5.2 Прогнать полный набор: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`
