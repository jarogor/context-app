## 1. Ядро: сведения и команда

- [x] 1.1 Модуль `src-tauri/src/plugin/app_info.rs` с моделями `AppInfo`/`AppPath` и сборкой расположений из корневых каталогов (юнит-тесты в `app_info_tests.rs`)
- [x] 1.2 Передача `AppInfo` в `AppState` и вычисление в `lib.rs` из версии пакета и каталогов
- [x] 1.3 Команда `app_info` (`commands/app_info.rs`), зарегистрированная в `invoke_handler`

## 2. Оболочка: страница «Информация»

- [x] 2.1 Компонент `src/lib/AppInfoPage.svelte`: название, версия, список расположений
- [x] 2.2 Пункт меню «Информация» и контентная область в `src/App.svelte`
- [x] 2.3 Фикстура мока команды `app_info` в `@texture/testing`

## 3. Тесты и спеки

- [x] 3.1 E2E-тест страницы «Информация» (версия и расположения)
- [x] 3.2 Спека `app-info` (дельта) и дополнение `app-shell` (пункт меню)
- [x] 3.3 `npm run check`, `cargo test`, `openspec validate --all` (27/27), `make verify`
