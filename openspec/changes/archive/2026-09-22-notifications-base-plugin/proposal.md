## Why

Ядро по-прежнему владеет журналом уведомлений и его UI, хотя заявленная цель — минимальный центр управления плагинами, где уведомления и настройки являются базовыми подключаемыми плагинами. Сейчас уведомления — единственная базовость, оставшаяся в ядре после выноса библиотеки, и она блокирует каркас для будущих приложений.

## What Changes

- **BREAKING** Перенести хранение и операции журнала уведомлений из ядра (`src-tauri/src/journal/`) в WASM base-плагин `notifications`, использующий служебное хранилище plugin-а.
- Ввести app-level runtime базовых плагинов, живущий независимо от per-library `PluginSession`: базовые плагины загружаются один раз на уровне приложения.
- Оставить в ядре только тонкие host-функции `log`/`notify`, которые маршрутизируют события в плагин уведомлений по capability; ядро не хранит журнал и не знает его модель.
- Перенести UI уведомлений из оболочки в отдельный frontend-плагин `notifications-ui` по образцу `library-ui`; shell оставляет только слот подключения frontend-плагинов.
- **BREAKING** Убрать из ядра команды `list_journal`, `mark_read`, `mark_all_read`, `clear_journal`, событие `journal:added` и модуль `journal`; доступ к журналу идёт через opaque операции плагина.
- Обновить манифесты, сборку WASM/frontend-плагинов, контракт host-функций и документацию архитектуры; зафиксировать конфиг как следующий базовый плагин вне текущего scope.

## Capabilities

### New Capabilities

Нет новых capabilities: изменение завершает существующий сценарий уведомлений и базовых плагинов, описанный в `notifications` и `plugin-system`.

### Modified Capabilities

- `notifications`: хранение, операции и UI журнала принадлежат базовому плагину; ядро предоставляет только транспорт событий, а лента и счётчик поставляются frontend-плагином.
- `plugin-system`: подсистема SHALL поддерживать app-level runtime базовых плагинов вне сессии библиотеки и маршрутизацию host-функций `log`/`notify` в плагин, предоставляющий capability уведомлений.

## Impact

- Rust-ядро: удаление `journal/`, правки `lib.rs`, `plugin/runtime.rs`, `plugin/session.rs`, `plugin/contract.rs`, `constants.rs`.
- WASM: новый плагин `src-wasm-plugins/notifications/` и его модели/тесты; `src-tauri/resources/plugins/notifications/`.
- Frontend: новый плагин `plugins/notifications-ui/`, правки `src/App.svelte`, `src/types.ts`, удаление `NotificationsPanel.svelte` и `Notifications.svelte` из shell.
- Сборка и ресурсы: workspace `src-wasm-plugins/Cargo.toml`, `scripts/build-wasm-plugins.sh`, `scripts/build-frontend-plugins.sh`.
- Документация и OpenSpec-спеки `notifications` и `plugin-system`.
