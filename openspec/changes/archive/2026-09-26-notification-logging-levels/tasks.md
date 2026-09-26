## 1. Контракт и шина

- [x] 1.1 Добавить в `plugin/bus.rs` перечисление степени `Severity` (`error`, `warn`, `info`, `debug`, `trace`, сериализация в нижнем регистре) с порядком и методом проверки порога; добавить поле `severity` в `PluginEvent`; обновить `bus_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml bus`
- [x] 1.2 Зафиксировать сигнатуры `log(severity, message, details)` и `notify(level, severity, message, details)` в `plugin/contract.rs`, не меняя `CONTRACT_VERSION`; пересобрать все плагины так, чтобы `scripts/build-wasm-plugins.sh` и `plugins/*/plugin-manifest.json` оставались на контракте `1`; проверить сборку и валидность сгенерированных манифестов

## 2. Ядро: логирование, порог, загрузка, трасса

- [x] 2.1 Переписать host-функции `host_log` и `host_notify` в `plugin/runtime.rs` на приём степени/канала и парсинг деталей (неизвестная степень → `info`); обновить `runtime_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml runtime`
- [x] 2.2 Обновить `AppPluginHost::publish_event`/`notify_user`/`notify_technical` на передачу степени серьёзности и публиковать технические события через общий фильтр порога; обновить `app_host_tests.rs` и прогнать `cargo test --manifest-path src-tauri/Cargo.toml app_host`
- [x] 2.3 Публиковать события загрузки в `PluginRuntime::load_filtered` (`info` для загруженного плагина с `id`/`name`/`kind`, `warn` для пропущенного с причиной); убрать ручные циклы сообщений из `lib.rs`; обновить `runtime_tests.rs` и `app_host_tests.rs`, прогнать `cargo test --manifest-path src-tauri/Cargo.toml plugin`
- [x] 2.4 Добавить трассировку вызовов в `PluginRuntime` (операция, длительность, результат/ошибка, `id`/`name`, усечение payload и результата) как техническое событие степени `trace`; покрыть тестами в `runtime_tests.rs`
- [x] 2.5 Ввести порог логирования: добавить поле `diagnostics.log_level` (select, по умолчанию `info`) в `APP_SETTINGS_SCHEMA`; читать значение и хранить в общем атомарном значении для app/session runtime; отбрасывать технические события ниже порога до публикации, обновлять после операций базовых плагинов; проверить настройку через `app_host_tests.rs` и `settings_registry_survives_restart`

## 3. Плагин уведомлений

- [x] 3.1 Расширить `Severity` до `error/warn/info/debug/trace`, принимать степень в `add_technical`, читать её в `publish` для технических записей; обновить `journal_tests.rs`/`lib_tests.rs` и прогнать `cargo test --manifest-path src-wasm-plugins/Cargo.toml`

## 4. Source/extension-плагины и UI

- [x] 4.1 Обновить `src-wasm-plugins/library`, `library-calibre`, `demo` на новые сигнатуры `log`/`notify` с уровнями (`emit_notification` получает степень; проба/индексация — `info`, ошибки — `error`); обновить их тесты и прогнать `cargo test --manifest-path src-wasm-plugins/Cargo.toml`
- [x] 4.2 Обновить `plugins/notifications-ui`: тип `Severity` (`error/warn/info/debug/trace`), отображение степени в `NotificationsPanel`, чтение `technical_visible_default` из capability `settings.store@1` вместо плагина уведомлений и обновление по `settings:changed`; поправить `plugins/notifications-ui/src/bridge.ts`; проверить сборку плагина

## 5. Критические места

- [x] 5.1 Покрыть `warn`/`error` конкретные точки: пропуск плагина (уже `warn`), источник не подтвердил/не нашёл корень (`warn`), недоступный путь библиотеки (`warn`), сбой регистрации реестра настроек (`warn`), ошибки `probe`/`open` source-плагинов (`error`); убедиться, что рутина не логируется выше `info`; покрыть тестами и прогнать `cargo test`

## 6. Документация и проверки

- [x] 6.1 Обновить `_docs/notifications.md` и `_docs/plugin-contract.md`: канал/уровень, порог `diagnostics.log_level`, новые сигнатуры host-функций (контракт `1`), события загрузки, трасса
- [x] 6.2 Обновить мок-фикстуры `packages/testing` (severity, действия) и e2e-ожидания; прогнать `npm test` и `npm run test:e2e`
- [x] 6.3 Полный набор: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`; проверить `git status --ignored`, что артефакты сборки не попали под контроль версий
