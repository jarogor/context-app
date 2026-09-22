## 1. Контракт манифеста и runtime

- [x] 1.1 Добавить в `PluginManifest` необязательное поле `settings: Option<serde_json::Value>` с `#[serde(default)]`; покрыть `plugin_manifest_tests.rs` случаями «есть поле» / «нет поля» и проверить `cargo test` для `plugin`
- [x] 1.2 Добавить в `contract.rs` константу `CAPABILITY_SETTINGS = "settings.store@1"`; проверить `cargo test` для `plugin`
- [x] 1.3 Сохранять декларацию настроек в `LoadedPlugin` при загрузке и добавить `PluginRuntime::settings_sources()`, возвращающий `{ owner, kind, schema }` только для плагинов с непустым `settings`; покрыть тестом в `runtime_tests.rs`
- [x] 1.4 Добавить `PluginSession::settings_sources()`, делегирующий в runtime; проверить `cargo test` для `plugin`

## 2. Базовый WASM-плагин настроек

- [x] 2.1 Создать workspace-плагин `src-wasm-plugins/settings/` (Cargo.toml, `models.rs`, `registry.rs`, `store.rs`, `lib.rs`, `host.rs`, `wasm.rs`) с операциями `register`, `list`, `get`, `set`; покрыть нативными тестами регистрацию, defaults, merge значений, сохранение и событие
- [x] 2.2 Реализовать отклонение дублирующегося полного идентификатора секции с диагностикой без частичного изменения реестра; покрыть тестом
- [x] 2.3 Хранить значения в служебном состоянии `settings.json` и публиковать `emit_event("settings:changed", ...)` при `set`; покрыть тестами сериализацию состояния и формирование события
- [x] 2.4 Добавить плагин в workspace `src-wasm-plugins/Cargo.toml` и в `scripts/build-wasm-plugins.sh` (`kind: base`, `provides: ["settings.store@1"]`, host-функции `state_read`/`state_write`/`emit_event`); проверить `scripts/build-wasm-plugins.sh` и наличие `resources/base-plugins/settings/`

## 3. Сбор реестра ядром и секция приложения

- [x] 3.1 Добавить константу `APP_SETTINGS_SCHEMA` и метод `AppPluginHost::refresh_settings_registry(session_sources)`, собирающий app-секцию, базовые и сессионные декларации и вызывающий `register`; покрыть тестами наличие и отсутствие провайдера настроек (`app_host_tests.rs`)
- [x] 3.2 Вызвать `refresh_settings_registry` после загрузки базовых плагинов и прочитать `startup.welcome_notification` для приветственного `notify_user`; проверить `cargo test` и ручным стартом приложения
- [x] 3.3 Вызвать `refresh_settings_registry` в `invoke_plugin_operation` после `session.configure`; покрыть тестом, что после открытия библиотеки source-декларации попадают в реестр
- [x] 3.4 Проверить `cargo test --manifest-path src-tauri/Cargo.toml` и отсутствие ссылок ядра на модель настроек (`rg "settings" src-tauri/src/plugin` не должен содержать разбора схемы)

## 4. Frontend-плагин настроек и оболочка

- [x] 4.1 Создать `plugins/settings-ui/` по образцу `notifications-ui` (package.json, vite.config, tsconfig, index.html, `plugin-manifest.json` с `kind: ui`, `requires: ["settings.store@1"]`, `bridge.ts`, `types.ts`, `main.ts`); проверить `npm --prefix plugins/settings-ui run check` и `run build`
- [x] 4.2 Реализовать `SettingsPlugin.svelte` с кнопкой в правом верхнем углу и `SettingsPage.svelte` со списком секций и JSON-редактором сохранения значений; проверить сборку и ручной сценарий сохранения
- [x] 4.3 Реализовать протокол `layout`-сообщений (`button`/`page`, `region: "settings"`) и `setLayout` в `bridge.ts`; проверить открытие/закрытие страницы без обрезания
- [x] 4.4 Добавить в `App.svelte` регион настроек с состояниями `button`/`page` и обработкой `handleLayout` для `region === "settings"`; проверить `npm run check`
- [x] 4.5 Добавить `settings-ui` в `scripts/build-frontend-plugins.sh` и `plugins/settings-ui/package.json`; проверить `npm run build:frontend-plugins`

## 5. Декларация настроек уведомлений

- [x] 5.1 Добавить в `scripts/build-wasm-plugins.sh` передачу `settings`-декларации для плагина `notifications` (секция `notifications`, `defaults.technical_visible_default = false`); проверить `scripts/build-wasm-plugins.sh` и содержимое манифеста
- [x] 5.2 Читать `technical_visible_default` в `notifications-ui` при монтировании (секция `notifications.notifications`) и инициализировать `technicalVisible`; проверить ручным сценарием с сохранённым `true` и с default

## 6. Документация и сквозные проверки

- [x] 6.1 Обновить `AGENTS.md` (плагин настроек, поле `settings`, capability `settings.store@1`, регион настроек) и `_docs` с описанием контракта настроек
- [x] 6.2 Обновить основные specs `plugin-system`, `notifications` и добавить spec `settings`; проверить `openspec validate --all`
- [x] 6.3 Выполнить `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` и `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- [x] 6.4 Выполнить `scripts/build-wasm-plugins.sh`, `npm run check`, `npm run build`; проверить сквозной сценарий: секции приложения и уведомлений в списке, сохранение JSON переживает перезапуск, переключатель «Технические» следует настройке
