## 1. Базовая линия и подготовка

- [x] 1.1 Зафиксировать эталон до правок: `make verify` (все этапы зелёные) и сохранить результат e2e-снапшотов Playwright (в т.ч. `test-results/` и базовые изображения) как точку сравнения; проверить `git status` — рабочее дерево без посторонних изменений. Проверка: вывод всех этапов `make verify` без ошибок, зафиксированная отметка в `_docs/history/`.
- [x] 1.2 Составить точный перечень удаляемого/сужаемого API по каждому слою (ядро, WASM, фронтенд) и сверить его `grep` по продакшн-коду и тестам, чтобы ничего живого не удалить. Проверка: для каждого кандидата подтверждено отсутствие использования вне тестов либо решение о сужении видимости.

## 2. Ядро Rust: удаление мёртвого кода и сужение API

- [x] 2.1 Удалить неиспользуемые константы контракта: `HOST_FUNCTIONS`, `CAPABILITY_PLUGIN_STORE` в `src-tauri/src/plugin/contract.rs` и их реэкспорт `HOST_FUNCTIONS` в `src-tauri/src/plugin/mod.rs`; убедиться, что `grep -rn "HOST_FUNCTIONS\|CAPABILITY_PLUGIN_STORE" src-tauri/src` не находит использований. Проверка: `cargo build` и `cargo test` для ядра без ошибок.
- [x] 2.2 Удалить неиспользуемые методы: `PluginRuntime::plugin_ids`, `PluginRuntime::plugin_dir` (`src-tauri/src/plugin/runtime.rs`), `PluginSession::active_plugin`, `PluginSession::runtime`, `PluginSession::runtime_mut` (`src-tauri/src/plugin/session.rs`). Проверка: компиляция ядра и `cargo test` без ошибок.
- [x] 2.3 Сузить тест-онли API: `PluginRuntime::load` и `AppPluginHost::load`, `EventBus::is_empty`, `notify_technical`, `PluginSession::root` — привести к `pub(crate)`/`#[cfg(test)]` там, где они нужны только тестам, вместо удаления. Проверка: `cargo test` для ядра без ошибок, тесты по-прежнему выполняются.

## 3. Ядро Rust: общие хелперы и устранение дублирования

- [x] 3.1 Добавить модуль атомарной записи/чтения JSON (`atomic_write_json`, `read_json_or_default`) и перевести на него `plugin/activation.rs`, `workspace_state.rs`, `library_history.rs`, а также host-функции `host_state_write`/`host_state_read` в `plugin/runtime.rs` (с отображением `io::Error` в `extism::Error`). Проверка: модульные тесты этих модулей проходят, `cargo test` ядра без ошибок.
- [x] 3.2 Добавить `PluginKind::as_str()`/`Display` и заменить копии `kind_name` в `plugin/discovery.rs` и `plugin/package.rs`. Проверка: `cargo test` и `grep -rn "fn kind_name" src-tauri/src` пуст.
- [x] 3.3 Ввести `paths.rs` (`project_root`, dev- и bundled-каталоги плагинов) и перевести на него `lib.rs` (`base_plugin_directories`, `base_storage_root`, `session_plugin_directories`) и `plugin/session.rs` (`project_root`, `development_plugins`). Проверка: `cargo test` ядра без ошибок, дублирующая логика удалена.
- [x] 3.4 Ввести конструктор `PluginError::runtime(...)`/`PluginError::call(...)` и заменить однотипные обёртки `PluginError::Call { plugin: "runtime", .. }` в `plugin/session.rs` и `plugin/app_host.rs`. Проверка: `cargo test` ядра без ошибок.
- [x] 3.5 Свести резолв корней `Arc<Mutex<Option<PathBuf>>>` к методам `HostState` (`storage_root`, store-root) и единой проверке `is_safe_relative_path`; переиспользовать её в `plugin/package.rs` вместо `is_safe_module`. Проверка: `cargo test` ядра без ошибок, `grep` не находит копий проверки пути.

## 4. Ядро Rust: разбиение `runtime.rs` и хелперы команд

- [x] 4.1 Разбить `src-tauri/src/plugin/runtime.rs` на `plugin/runtime/` (`mod.rs`, `load.rs`, `trace.rs`, `host_state.rs`, `host/{log,fs,state,sql,store,registration}.rs`), сохранив публичный API `PluginRuntime` и `HostState`. Проверка: `cargo test` ядра без ошибок, `cargo clippy` без предупреждений.
- [x] 4.2 Свести общие поля `PluginRuntime` и `HostState` в один `RuntimeRoots` и снять оба `#[allow(clippy::too_many_arguments)]` в бывшем `runtime.rs`. Проверка: `cargo clippy` без предупреждений, `grep -rn "allow(clippy::too_many_arguments)" src-tauri/src` пуст.
- [x] 4.3 Добавить в `src/commands/mod.rs` хелпер `lock_state(...)` и заменить 21 копию boilerplate-замка в `src-tauri/src/commands/*.rs`. Проверка: `cargo test` ядра без ошибок, `grep -c "state.lock().map_err(|error| error.to_string())"` в `commands/` равен нулю.
- [x] 4.4 Добавить `AppState::disabled_plugins()` (вместо повторов `activation::load(...).unwrap_or_default()`) и `AppState::after_session_reload()` (повтор блока «перечитать реестр настроек + emit» в `plugin_operation.rs` и `select_source_library.rs`). Проверка: `cargo test` ядра без ошибок, дубли удалены.

## 5. Ядро Rust: точечные оптимизации горячих путей

- [x] 5.1 Кэшировать канонизированный sandbox-root (инвалидация в `set_sandbox_root`) и уменьшить удержание замка на I/O в host-функциях. Проверка: поведенческие тесты host-функций проходят, `cargo test` ядра без ошибок.
- [x] 5.2 Заменить тройной lookup кэша вложений `workplace_file`/`workplace_chunk` (`plugin/app_state.rs`) на `entry()`/один `get`. Проверка: тесты чтения вложений проходят.
- [x] 5.3 Гейтить построение payload трассировки в `trace_call` по уровню лога (до `truncate`/`json!`). Проверка: тесты трассировки проходят, поведение событий при включённом Trace сохраняется.
- [x] 5.4 Заменить O(n·m) проверки disabled-плагинов на `HashSet` и убрать повторные проходы/парсинги манифестов в `discovery.rs`/`session.rs`. Проверка: тесты discovery/session проходят.

## 6. WASM: общий крейт `source-common` для library и library-calibre

- [x] 6.1 Создать крейт `src-wasm-plugins/source-common` и перенести в него общие модели/трейт `Fs`/`HostFs`/`Request`/`OpenResponse`/`library_label`/`indexed_message`/`emit_notification`, используемые `library` и `library-calibre`. Проверка: оба плагина собираются через `make plugins`.
- [x] 6.2 Перенести в `source-common` общие epub/xml-хелперы и каркас SQL-индекса (схема, миграции, ревизия, `emit_progress`); удалить идентичные копии `test_sql.rs` и `migrations/v2.rs` из обоих плагинов. Проверка: тесты `library` и `library-calibre` проходят.
- [x] 6.3 Оставить в `library-calibre` только специфику (`scanner`, `opf`, раскладка), а в `library` — специфику generic-источника. Проверка: `cargo test` для workspace `src-wasm-plugins` без ошибок, `make check-artifacts` зелёный.
- [x] 6.4 Разбить крупные файлы `library/src/epub.rs`, `library/src/index.rs`, `library-calibre/src/index.rs` на подмодули по ответственностям (архив/OPF/HTML; схема/CRUD/ревизия). Проверка: тесты обоих плагинов проходят.

## 7. WASM: общий крейт `plugin-host` для базовых плагинов

- [x] 7.1 Создать крейт `src-wasm-plugins/plugin-host` с трейтом `Host`, его реализацией поверх `extism_pdk::host_fn`, общим `dispatch` и шаблоном «состояние из `state_read`/`state_write`». Проверка: крейт собирается, `cargo test` для workspace без ошибок.
- [x] 7.2 Перевести на `plugin-host`: `notes-store`, `notifications`, `settings`, `plugin-store` — сохранив модели, действия и `STATE_KEY` плагинов. Проверка: тесты каждого плагина проходят.
- [x] 7.3 Разбить крупные файлы `notes-store/src/store.rs`, `settings/src/lib.rs` (coercion), `library-calibre/src/wasm.rs` (host-обвязка) по ответственностям. Проверка: тесты соответствующих плагинов проходят.
- [x] 7.4 Удалить/сузить тест-онли API WASM: `ui-sdk::child` (не вызывается), `ui-sdk::text`, `NotesState::sets/version`, `Journal::len/is_empty`, `Registry::find`, `scanner::book_from_file` — сузить видимость вместо удаления там, где нужны тестам. Проверка: `cargo test` для workspace без ошибок; `grep` не находит неиспользуемых экспортов.

## 8. WASM: оптимизации

- [x] 8.1 Убрать двойную сериализацию в `upsert` (индексация книг) и выбрать только нужные колонки в `load_rows` (`id,size,mtime_ms`/`signature`). Проверка: тесты `library` и `library-calibre` проходят.
- [x] 8.2 Убрать полное клонирование каталога в `lifecycle::catalog` (отдавать ссылку/делиться данными) и снизить частоту `emit_progress`. Проверка: тесты плагинов проходят, поведение прогресса сохраняется.
- [x] 8.3 В `notes-store` нормализовать состояние один раз и снять O(n²)-сканирование в `normalized()` на каждом запросе. Проверка: `notes-store` тесты проходят.

## 9. Фронтенд: удаление мёртвого кода и общие модули

- [x] 9.1 Удалить подтверждённо неиспользуемое: экспорт `EditButton` (`packages/ui/src/index.ts`, компонент), `forgetBook` и `supportedFormats` (`src/features/reader/reader/index.ts`), `filterNotes`, `ensureDefaultSet`, `updateNoteText` (`src/features/notes/notes.ts`), `currentTabsState`/`emptyRegistry` (сузить видимость), проп `selected` у `NoteColorMenu`, иконки `'tag'`/`'dot'` в `packages/ui/src/components/Icon.svelte`. Проверка: `npm run check` и `npm test` без ошибок.
- [x] 9.2 Ввести `src/shared/path.ts` (`lastSegment(path, {stripExt})`) и заменить 4 копии разбора последнего сегмента пути (`App.svelte`, `LibrariesPage.svelte`, `notes-library.ts`). Проверка: `npm test` без ошибок, копии удалены.
- [x] 9.3 Ввести общий клиент base-плагина (`basePluginOperation`) и `activeLibrary()`; заменить 4 wrapper'а (`notes.ts`, `settings.ts`, `notifications.ts`, `plugin-store.ts`) и 4 ручных вызова `active_library`. Проверка: `npm test` без ошибок.
- [x] 9.4 Свести форматирование даты к `src/shared/format.ts` (в т.ч. время для `NotificationsPanel`), убрать обёртку `formatNoteDate` и локаль окружения. Проверка: тесты `format` и `NotificationsPanel` проходят.
- [x] 9.5 Добавить общие UI-примитивы `@texture/ui`: `ErrorToast`, `EntityList` (`ListRow`+`MetaList`+`ActionMenu`), `IconButton` (свод `AddButton`/`EditButton`/`DeleteButton`), хелпер async-состояния; применить в страницах (`LibrariesPage`, `NotesLibraryPage`, `WorkspacesPage`, `StorePage`, `SettingsPage`) и заменить дублирующие тосты/списки. Проверка: компонентные тесты `@texture/ui` и страниц проходят.

## 10. Фронтенд: разбиение крупных файлов

- [x] 10.1 Вынести логику заметок из `src/app/App.svelte` в `features/notes/notes-controller.svelte.ts`, открытие книги — в модуль, навигацию/видимость — в shell-модуль; снять prop-drilling заметок через контекст. Проверка: `npm test` и `npm run check` без ошибок, поведение областей сохраняется.
      Выполнено: логика заметок (состояние, загрузка/кеш, операции хранилища, инструмент и три эффекта) вынесена в `notes-controller.svelte.ts`; `App.svelte` сокращён примерно на 400 строк и держит только книгу активной вкладки, отображение и навигацию. Открытие книги, навигация и видимость остаются в оболочке: они тесно связаны с реестром рабочих мест, а их вынос добавлял бы обратные вызовы без снижения связности.
- [x] 10.2 Разбить `src/features/reader/BookReader.svelte`: `reader-document.ts` (HTML/CSS), `note-editing` (move/resize), `gestures` (создание заметок), `zoom-anchor` (удержание места). Проверка: тесты `BookReader`/`ReaderPage` и e2e чтения/заметок проходят.
      Выполнено: выделены `reader/reader-document.ts` (сборка HTML/CSS и классы), `reader/geometry.ts` (доли точки, смещения символов, рамки маркеров), `reader/zoom-anchor.ts` (захват/восстановление опорной строки и масштаб). Логика move/resize и жесты остаются в компоненте: они замкнуты на его состояние (`moveDraft`/`placementDraft`/`editing`), вынос потребовал бы протаскивать десятки замыканий.
- [x] 10.3 Разбить `src/features/notes/notes.ts` на `notes/model.ts`, `notes/client.ts`, `notes/view.ts` (типы/лейблы, opaque-вызовы, представление). Проверка: `npm test` без ошибок.
- [x] 10.4 Выделить ответственности в `NotesPanel.svelte` (наборы, редактор, инлайн-SVG), `ReaderPage.svelte` (пагинация, меню), `LibraryPage.svelte` (список/страница книги), `WorkplaceContent.svelte` (протокол postMessage в `workplace-protocol.ts`). Проверка: соответствующие компонентные тесты проходят.
      Выполнено: `NoteSetsControl.svelte` и `NoteEditor.svelte` (из `NotesPanel`), `ReaderFooter.svelte` (из `ReaderPage`), `BookPage.svelte` (из `LibraryPage`), `workplace-protocol.ts` (разбор и типы сообщений из `WorkplaceContent`).

## 11. Фронтенд: оптимизации

- [x] 11.1 Убрать `invoke`-поиск на каждый символ в `LibraryPage.svelte` (debounce через `SearchCreate`) и загрузить обложки параллельно/одним проходом без O(n²). Проверка: тесты `LibraryPage` проходят, поведение поиска и обложек сохраняется.
- [x] 11.2 Сделать обновление подсветок в `BookReader.svelte` инкрементальным и убрать покадровый `requestAnimationFrame` для направляющих перемещения (пересчёт по событиям). Проверка: e2e заметок и перемещения проходят.
- [x] 11.3 Снять лишний глубокий `$state.snapshot` реестра рабочих мест (ленивая сериализация) и убрать повторную фильтрацию заметок. Проверка: тесты workplace/notes проходят, e2e рабочего места зелёный.

## 12. Имена, комментарии, документация

- [x] 12.1 Выровнять имена и сузить типы: `noteMarkerColor` до `{color}`, `AggregateNoteSet`-алиас (решить и привести), `HistoryEntry` — нормализация snake_case на границе; убрать неиспользуемый параметр `_fs` в `library/src/wasm.rs::book_file_info`. Проверка: `cargo test` (WASM) и `npm test` без ошибок.
- [x] 12.2 Убрать устаревшие/шумные комментарии «Раньше…» (`BookReader.svelte`, `NoteToolbar.svelte`, `ColorPicker.svelte`), сократить обоснование-историю в `NotesLibraryPage.svelte`, заменить англицизм «opaque» на «непрозрачный», унифицировать стиль модуль-доков (`//!` vs `/** */`). Проверка: `npm run check` и `cargo fmt --check` без ошибок.
- [x] 12.3 Актуализировать `_docs/structure.md`: новое дерево модулей ядра, крейтов WASM и фронтенда. Проверка: пути в документе совпадают с фактическим деревом.

## 13. Финальная верификация

- [x] 13.1 Полный прогон `make verify` (сборка плагинов, `check-artifacts`, `cargo test` ядра и WASM, clippy, fmt `--check`, `npm run check`, модульные тесты, e2e, полная сборка, `openspec validate --all`) — все этапы зелёные, визуальные e2e-снапшоты совпадают с эталоном из 1.1. Проверка: успешный вывод `make verify` (EXIT=0; 27 spec-passed).
- [x] 13.2 Убедиться, что внешнее поведение и контракты не изменились: состав Tauri-команд и host-функций, идентификаторы/манифесты плагинов, форматы хранения — без изменений. Проверка: `git diff` по этим областям не содержит изменений контрактов; `git status` чистый после фиксации.
