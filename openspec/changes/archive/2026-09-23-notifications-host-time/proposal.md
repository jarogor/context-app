## Why

Журнал уведомлений пуст: `publish` падает в WASM, потому что `SystemTime::now()` не поддерживается на `wasm32-unknown-unknown` и паникует. Время для метки записи нужно получать от host-приложения.

## What Changes

- Добавить в контракт host-функцию `now_millis`, возвращающую текущее время Unix в миллисекундах, и зарегистрировать её в runtime приложения.
- Передавать метку времени в журнал уведомлений из host-функции вместо `SystemTime::now()` внутри WASM.

## Capabilities

### New Capabilities

Нет новых capabilities.

### Modified Capabilities

- `plugin-system`: контракт host-функций дополняется функцией текущего времени, доступной плагинам.

## Impact

- Rust-ядро: `plugin/contract.rs`, `plugin/runtime.rs`.
- WASM: `src-wasm-plugins/notifications/` (`host.rs`, `wasm.rs`, `lib.rs`, `journal.rs`, `models.rs`, тесты).
