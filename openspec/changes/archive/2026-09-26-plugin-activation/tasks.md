## 1. Реестр активности и загрузка

- [x] 1.1 Модуль `plugin/activation.rs`: чтение/запись реестра отключённых и переключение; покрыть тестами
- [x] 1.2 Фильтрация отключённых при загрузке плагинов (`PluginSession::set_disabled_plugins` → `PluginRuntime`); покрыть тестом, что отключённый не загружается, а базовые игнорируют отключение

## 2. Привилегированные host-функции стора

- [x] 2.1 Host-функция `store_plugins`: перечень отключаемых плагинов из директорий с `enabled`/`removable`; покрыть тестом
- [x] 2.2 Host-функция `store_set_enabled`: переключение с запретом базовых и неизвестных; покрыть тестом
- [x] 2.3 Добавить имена функций в `contract.rs`, в гейтинг по `host_functions` и в манифест плагина стора

## 3. Плагин стора и UI

- [x] 3.1 Операции `plugins` (перечень с активностью) и `set_enabled` в `plugin-store`; покрыть тестами
- [x] 3.2 Переключатели активности в `plugin-store-ui` и обновление фикстур мок-моста; проверить сборку

## 4. История

- [x] 4.1 `library_history_list` исключает отключённых провайдеров; покрыть тестом скрытие/возврат

## 5. Проверки

- [x] 5.1 Проверки: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`
