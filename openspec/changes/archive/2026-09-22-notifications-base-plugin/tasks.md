## 1. Контракт и манифест базовых плагинов

- [x] 1.1 Добавить в `PluginManifest` поле `kind` со значениями `base`/`source`/`extension`/`ui`, значением по умолчанию `extension` и валидацией; расширить `plugin_manifest_tests.rs` проверками дефолта и недопустимого значения
- [x] 1.2 Добавить в `plugin/contract.rs` константу host-функции `emit_event` и capability уведомлений, включить их в список host-функций; проверить `cargo test` для `plugin`
- [x] 1.3 Зарегистрировать host-функцию `emit_event(name, payload)` в `PluginRuntime::load_plugin_dir`, эмитящую Tauri-событие через app handle; проверить ошибку при отсутствии app handle без паники

## 2. Событийный bus вместо ядрового журнала

- [x] 2.1 Создать `plugin/bus.rs` с `PluginEvent` и глобальным `EventBus` (`publish`/`drain`/очистка); покрыть тестами накопление, порядок и очистку (`plugin/bus_tests.rs`)
- [x] 2.2 Перевести host-функции `log` и `notify` на публикацию `PluginEvent` в bus; удалить `HostSink`, `PluginRuntime::logs()` и модуль `host_sink`; обновить `runtime_tests.rs` под новое поведение
- [x] 2.3 Удалить `crate::journal` из путей `plugin/runtime.rs`; проверить, что `plugin` не ссылается на журнал (`rg "journal" src-tauri/src/plugin`)

## 3. App-level runtime базовых плагинов

- [x] 3.1 Создать `plugin/app_host.rs` с `AppPluginHost`: загрузка базовых плагинов из `resources/base-plugins/`, собственные storage root и sandbox, фильтр по `kind == "base"`; покрыть тестами загрузку, отсутствие директории и пропуск некорректного плагина
- [x] 3.2 Добавить в `PluginRuntime` поиск провайдера capability и `invoke_capability(capability, action, payload)`; покрыть тестами успех и отсутствие провайдера
- [x] 3.3 Реализовать `AppPluginHost::drain_and_deliver`, `notify_user` и `notify_technical`: доставка событий из bus в плагин с capability уведомлений с безвредным отбрасыванием при отсутствии провайдера; покрыть тестами оба случая
- [x] 3.4 Добавить Tauri-команду `invoke_base_plugin_operation(plugin, operation, payload)` и подключить `AppPluginHost` как отдельное состояние в `lib.rs`; проверить вызов базовой операции без активной библиотеки

## 4. WASM-плагин уведомлений

- [x] 4.1 Создать workspace-плагин `src-wasm-plugins/notifications/` (Cargo.toml, `models.rs`, `journal.rs`, `lib.rs`) с операциями `publish`, `list`, `mark_read`, `mark_all_read`, `clear`; покрыть нативными тестами `journal_tests.rs` кольцевой буфер, фильтр уровня, отметку прочтения и очистку
- [x] 4.2 Реализовать в `lib.rs` WASM-точку входа: использование `state_read`/`state_write` для `journal.json`, вызов `emit_event("notifications:added", entry)` при добавлении; покрыть тестами сериализацию состояния и формирование события
- [x] 4.3 Описать `plugin-manifest.json` плагина (`kind: base`, `provides: ["notifications.journal@1"]`, используемые host-функции); расширить `scripts/build-wasm-plugins.sh` сборкой и деплоем в `resources/base-plugins/notifications/`; проверить `scripts/build-wasm-plugins.sh`

## 5. Frontend-плагин уведомлений

- [x] 5.1 Создать `plugins/notifications-ui/` по образцу `library-ui` (package.json, vite.config, index.html, `bridge.ts` с вызовом `invoke_base_plugin_operation` и `listen`); проверить `npm --prefix plugins/notifications-ui run check` и `run build`
- [x] 5.2 Перенести логику ленты, счётчика, переключателя «Технические» и mobile-страницы из `src/lib/NotificationsPanel.svelte` и `src/pages/Notifications.svelte` в Svelte-компоненты плагина; проверить сборку и ручной сценарий открытия/очистки
- [x] 5.3 Реализовать протокол `layout`-сообщений (свёрнутая полоса, развёрнутая панель, страница) и адаптацию по ширине iframe внутри плагина; проверить сценарии десктоп/мобильный вручную без обрезания панели

## 6. Очистка ядра и оболочки

- [x] 6.1 Удалить `src-tauri/src/journal/`, регистрацию команд и `journal::set_app_handle`/`set_journal_handle` из `lib.rs`; проверить `cargo build`
- [x] 6.2 Убрать код уведомлений из `src/App.svelte` и типы `Entry` из `src/types.ts`, добавить слот-регион `PluginFrame` для `notifications-ui` с обработкой `layout`; удалить `src/lib/NotificationsPanel.svelte` и `src/pages/Notifications.svelte`; проверить `npm run check`
- [x] 6.3 Заменить ядровые точки `add_user`/`add_technical` (загрузка плагинов, demo-ответ) на `AppPluginHost::notify_user`/`notify_technical`; проверить, что после старта события появляются в ленте
- [x] 6.4 Расширить `scripts/build-frontend-plugins.sh` сборкой `library-ui` и `notifications-ui`; проверить `npm run build:frontend-plugins`

## 7. Документация и общие проверки

- [x] 7.1 Обновить `AGENTS.md` и документацию plugin contract: app-level базовые плагины, `kind`, host-функции `log`/`notify`/`emit_event`, маршрутизация по capability, следующий базовый плагин конфига вне scope
- [x] 7.2 Обновить основные specs `plugin-system` и `notifications` после реализации; проверить `openspec validate --all`
- [x] 7.3 Выполнить `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` и `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- [x] 7.4 Выполнить `scripts/build-wasm-plugins.sh`, `npm run check`, `npm run build`; проверить сквозной сценарий: событие source-плагина попадает в ленту, читается frontend-плагином, переживает перезапуск
