## 1. Host-функция времени

- [x] 1.1 Добавить `HOST_NOW_FUNCTION = "now_millis"` в `contract.rs` и включить в `HOST_FUNCTIONS`; проверить `cargo test --manifest-path src-tauri/Cargo.toml plugin`
- [x] 1.2 Зарегистрировать `now_millis` в `PluginRuntime::load_plugin_dir`, возвращая текущее время Unix в миллисекундах; проверить `cargo test` и `cargo clippy`

## 2. Плагин уведомлений

- [x] 2.1 Добавить `now_millis()` в трейт `Host` и реализовать через host-функцию в `wasm.rs`; обновить `FakeHost` тестов фиксированным временем
- [x] 2.2 Передавать метку времени в `Journal` (параметр записи) из `lib.rs`; удалить `SystemTime` из `models.rs`; обновить `journal_tests`/`lib_tests`
- [x] 2.3 Пересобрать WASM (`scripts/build-wasm-plugins.sh`) и проверить запись события: `real_notifications_plugin_records_events`
- [x] 2.4 Возвращать время из host-функции строкой (numeric-ABI давал 0); тест проверяет `timestamp > 0`

## 3. Проверки и спека

- [x] 3.1 Обновить основную спеку `plugin-system` (host-функция времени); проверить `openspec validate --all`
- [x] 3.2 Выполнить `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`, `cargo test --manifest-path src-wasm-plugins/Cargo.toml`
