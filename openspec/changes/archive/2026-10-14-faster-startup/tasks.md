## 1. Инструменты измерения

- [x] 1.1 Добавить в `Makefile` цель `release` (`npm run tauri build`) и цель `run-release` (сборка через `npm run tauri build -- --no-bundle` и запуск бинаря из `src-tauri/target/release/`); проверить, что цели видны в `make help` и `make release` собирает приложение без ошибок
- [x] 1.2 Замерить время от запуска до первого кадра в debug- и release-сборке (по записи экрана или логам) и записать результат в описании изменения; подтвердить, что release заметно быстрее

## 2. Снятие лишнего со старта

- [x] 2.1 Убрать безусловный вызов `reader_formats()` из `onMount` в `src/features/library/LibraryPage.svelte` и запрашивать форматы при показе поверхности библиотеки/открытии книги; проверить `src/features/library/LibraryPage.test.ts` и добавить сценарий «форматы не запрашиваются без библиотеки»
- [x] 2.2 Убрать `listAllSets()` из `src/features/lifecycle/bootstrap.ts` (поле `notesLibrary` в `BootstrapState`); обновить `src/app/Root.svelte` и `src/app/App.svelte`
- [x] 2.3 Загружать реестр заметок в `src/app/App.svelte` при открытии раздела «Заметки» с показом индикатора; проверить `src/app/App.test.ts` и `src/features/notes-library/NotesLibraryPage.test.ts`
- [x] 2.4 Обновить `src/features/lifecycle/bootstrap.test.ts`: реестр заметок больше не читается на стадии начальной загрузки; тесты проходят

## 3. Фоновая инициализация базовых плагинов

- [x] 3.1 В `src-tauri/src/lib.rs` запустить сборку app-level runtime базовых плагинов в фоне в `setup` (после `AppState::new`), не дожидаясь её; проверить, что `setup` возвращается без компиляции WASM
- [x] 3.2 Хранить готовый app-level runtime так, чтобы `AppState::app_host()` возвращал результат без повторной сборки и без удержания общего замка на время компиляции; обновить `src-tauri/src/plugin/app_state_tests.rs`
- [x] 3.3 Обеспечить, что лёгкие команды (`get_workspaces`, `save_workspaces`, `active_library`) не ждут фоновую инициализацию; добавить/обновить тест, проверяющий отсутствие блокировки (не держим общий замок на время компиляции)

## 4. Инициализация чтения вне критического пути

- [x] 4.1 Собирать runtime чтения (`AppState::reader()`) вне удержания общего замка `AppState`; обновить команды `src-tauri/src/commands/reader.rs` и `src-tauri/src/plugin/app_state_tests.rs`
- [x] 4.2 Согласовать фоновый прогрев source-плагинов (`src-tauri/src/plugin/warmup.rs`) с runtime чтения: одна компиляция на набор, без конкурирующих компиляций; обновить тесты прогрева
- [x] 4.3 Проверить, что повторное обращение к `reader()` использует готовый runtime без повторной загрузки; тесты проходят

## 5. Гигиена кэша WASM

- [x] 5.1 Ограничить и очищать кэш компиляции в `src-tauri/src/plugin/wasm_cache.rs`: удалять устаревшие записи, не трогая используемые текущими модулями; сбой очистки не прерывает запуск
- [x] 5.2 Добавить тесты `src-tauri/src/plugin/wasm_cache_tests.rs` на очистку и на безопасность при ошибке; проверить, что после нескольких правок кэш не растёт неограниченно

## 6. Проверки и спеки

- [x] 6.1 Обновить браузерные сценарии (`tests/e2e/`) под новое поведение старта и раздела «Заметки»; `make e2e` проходит
- [x] 6.2 Прогнать `make verify` без ошибок и предупреждений
- [x] 6.3 Свериться со спеками `app-lifecycle`, `app-shell`, `notes-library`, `library-ui`, `plugin-system`: `openspec validate --all` проходит
