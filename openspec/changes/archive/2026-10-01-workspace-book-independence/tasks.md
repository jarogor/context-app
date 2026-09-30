## 1. Runtime чтения в ядре

- [x] 1.1 Ввести `ReaderConfig` и ленивый `reader: Option<PluginRuntime>` в `AppState`; собирать runtime из source- и workplace-плагинов без привязки к активной сессии библиотеки
- [x] 1.2 Реализовать чтение по пути: `reader_content`/`reader_open_external` с песочницей на директорию файла и payload `{ path: <имя файла> }`
- [x] 1.3 Реализовать порции файла вложения по пути (`workplace_file`/`workplace_chunk`) и сброс кэша (`forget_workplace_file`)

## 2. IPC-команды чтения

- [x] 2.1 Добавить `commands/reader.rs`: `reader_formats`, `reader_plugin_for_format`, `reader_viewer`, `reader_content`, `reader_open_external`, `reader_book_chunk`, `reader_forget_book`
- [x] 2.2 Удалить `commands/workplace.rs`; зарегистрировать новые команды в `lib.rs` и `commands/mod.rs`; экспортировать `ReaderConfig` из `plugin/mod.rs`

## 3. Состояние вкладки по пути

- [x] 3.1 Перевести `workspace_state.rs` на поле `path` с алиасом `book_id` для миграции; обновить тесты
- [x] 3.2 Переработать `src/lib/workplace.ts`: `WorkspaceTab.path`, `BookRef.path`, `openBook`/`replaceTabBook`/`serializeTab` по пути; обновить модульные тесты

## 4. Чтение без библиотеки

- [x] 4.1 Переработать `src/lib/reader/index.ts`: `formatFromPath`, чтение по пути через `reader_*`, форматы и плагин рабочего места по пути; обновить тесты
- [x] 4.2 Переработать `ReaderPage.svelte`: чтение по пути, отсутствие состояния «библиотека не открыта», заглушка недоступной книги с «Указать файл» и «Убрать вкладку»
- [x] 4.3 Обновить `WorkplaceSurface.svelte`, `WorkplaceTabs.svelte`, `WorkplaceContent.svelte` на путь и кнопку «Открыть файл с диска»

## 5. Поток открытия и переуказания

- [x] 5.1 Переработать `App.svelte`: вкладки по пути, открытие произвольного файла через системный диалог, переуказание недоступной вкладки любым файлом, без автоматического открытия библиотеки
- [x] 5.2 Перевести `src/lib/notes.ts` на `bookKey(path)`; подтвердить общие заметки одной книги в разных вкладках

## 6. Библиотечный UI

- [x] 6.1 Передавать абсолютный путь книги (`active_library` + относительный путь) в `openInWorkplace`; выбирать форматы по `reader_formats`

## 7. Мок и тесты

- [x] 7.1 Обновить мок-мост `packages/testing/src/fixtures.ts`: команды `reader_*` и `dialogResult`
- [x] 7.2 Переписать браузерные сценарии `workplace-persist.spec.ts` (переуказать файл с диска, чтение без открытой библиотеки) и `workplace-reader.spec.ts`; обновить `workplace-tabs.spec.ts`

## 8. Документация и проверки

- [x] 8.1 Обновить `ROADMAP.md` (статусы, журнал решений о вложении-пути и независимости рабочего места) и `_docs/reader.md` / `_docs/notes-editor.md`
- [x] 8.2 Выполнить `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt -- --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build` и `openspec validate --all`; все проверки проходят
