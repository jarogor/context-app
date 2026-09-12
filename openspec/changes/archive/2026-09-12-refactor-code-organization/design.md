## Context

Приложение `jarogor-booklib` (Tauri 2 + Svelte + Rust) — мотивация в `proposal.md` (Why). Текущее состояние кода, которое формирует объём работ:

- `src-tauri/src/lib.rs` — 81 строка: setup, seed demo-плагина, генерация команд; константа `DEMO_PLUGIN_DIR`.
- `src-tauri/src/commands.rs` — 89 строк: четыре `#[tauri::command]` (`import_book`, `list_books`, `get_cover`, `get_book_content`) со всей логикой внутри и модель ответа `BookContent`.
- Инлайн-модели в файлах модулей: `Layout` в `library/mod.rs`, `WrittenFiles` в `import/mod.rs`, `ExtractedMetadata`/`CoverData` в `import/epub_parser.rs`, `FileConfig`/`DataConfig`/`AppConfig` в `config.rs`, `HostSink`/`LoadedPlugin`/`PluginRuntime` в `plugin/runtime.rs`, `PluginManifest` в `plugin/contract.rs`.
- Инлайн-тесты `#[cfg(test)] mod tests` в 8 файлах: `config.rs`, `library/mod.rs`, `catalog/schema.rs`, `catalog/repository.rs`, `import/mod.rs`, `reading/mod.rs`, `plugin/runtime.rs`, `plugin/contract.rs`. Тесты используют приватные элементы родительского модуля (`use super::*`) и утилиту `src-tauri/src/test_util.rs`.
- Константы раскиданы: `lib.rs` (`DEMO_PLUGIN_DIR`), `config.rs` (`CONFIG_FILE_NAME`, `DEFAULT_LIBRARY_DIR`, `LIBRARY_DIR_ENV`), `library/mod.rs` (`DATABASE_FILE_NAME`, `BOOKS_DIR_NAME`, `COVERS_DIR_NAME`, `PLUGINS_DIR_NAME`). Доменные константы — `SCHEMA_VERSION` (catalog/schema.rs), `CONTRACT_VERSION`, `MANIFEST_FILE_NAME`, `EXPORT_FUNCTION`, `HOST_LOG_FUNCTION`, `HOST_FUNCTIONS` (plugin/contract.rs) — несут контрактный смысл и остаются в своих модулях.
- Форматирование: пользователь уже добавил `.editorconfig` и прогнал `cargo fmt --all` + `npm run format:ts` (коммиты `1b3ebf2`, `b68df43`, `9181c5a`). Расхождение: `.editorconfig` объявляет для `*.rs` `indent_style = tab`, но rustfmt по умолчанию форматирует пробелами (4). `rustfmt.toml` в проекте отсутствует. Фронтенд форматируется prettier (скрипты `format:ts`/`check:ts`), `.prettierrc` нет.

Ограничения: ничего за пределами рабочей директории; комментарии к коду на русском; один тип — один файл (за исключением тесно связанных приватных DTO); вертикальная архитектура.

## Goals / Non-Goals

**Goals:**
- Разгрузить файлы реализаций: тесты выносятся в отдельные файлы с сохранением доступа к приватным элементам родительского модуля.
- Развести публичные и приватные модели по отдельным файлам согласно правилу «один тип — один файл».
- Свести `commands.rs` к компактному перечню команд; логика каждой команды отделяется в собственный обработчик.
- Централизовать общие константы приложения в `constants.rs`.
- Согласовать стиль: `rustfmt.toml` + `.editorconfig`, повторное `cargo fmt --all`, единая конфигурация prettier для фронтенда.

**Non-Goals:**
- Не меняется поведение: Tauri IPC-команды (имена, сигнатуры, формат ответов), схема БД, структура портируемой библиотеки, манифест и контракт плагинов.
- Не меняется npm-зависимости фронтенда (prettier уже есть; svelte-check, tsc, vite не трогаем).
- Не выполняется миграция данных и не меняется контракт `test_util.rs`.

## Decisions

### 1. Вынос тестов через `#[path]`
Инлайн-блок `#[cfg(test)] mod tests { ... }` переносится в отдельный файл рядом с исходным, подключение — атрибутом `#[path]`:
```rust
#[cfg(test)]
#[path = "config_tests.rs"]
mod tests;
```
Для директорий-модулей (`library/`, `import/`, `reading/`) файл тестов — `<модуль>/tests.rs`; для файловых модулей — `<имя>_tests.rs` в той же папке. Почему не `tests/`-крейт: тесты обращаются к приватным элементам (`use super::*`) и `test_util`, вынос в интеграционные тесты потребовал бы публикации API и дублирования хелперов. Почему не переименование модуля в директорию: `#[path]` дешевле, не трогает `mod`-граф и импорты. Вариант «оставить тесты в файле» отклонён как противоречащий цели.

### 2. Вынос моделей по правилу «один тип — один файл»
Публичные модели разводятся по своим файлам: `BookContent` → `commands/content.rs`; `AppConfig` → `config/app_config.rs`; `Layout` → `library/layout.rs`; `HostSink` → `plugin/host_sink.rs`, `LoadedPlugin` → `plugin/loaded_plugin.rs`, `PluginRuntime` → `plugin/runtime.rs` (содержимое переносится), `PluginManifest` → `plugin/plugin_manifest.rs`. `FileConfig`/`DataConfig` и `WrittenFiles`, `ExtractedMetadata`/`CoverData` — приватные DTO, тесно связанные с модулем; группируются в одном файле `<модуль>/models.rs`, чтобы не плодить файлы ради приватных типов. Это допущение к правилу «один тип — один файл» для приватных вспомогательных структур.

### 3. Модуль команд как директория-слайс
`commands.rs` преобразуется в директорию `commands/`:
- `commands/mod.rs` — объявления подмодулей и компактный перечень `pub use` команд (реэкспорт), чтобы `lib.rs` остался нетронутым по формату `commands::import_book`.
- `commands/import_book.rs`, `commands/list_books.rs`, `commands/get_cover.rs`, `commands/get_book_content.rs` — каждый `#[tauri::command]` в своём файле.
- `commands/content.rs` — модель `BookContent`.
Команды остаются тонкими обёртками над сервисными функциями (`import::import_book`, `repository::list_books`, `reading::extract_book_text`) — переносится только текущее тело функции без изменения логики.

### 4. Централизация констант
Создаётся `src-tauri/src/constants.rs` с общими константами приложения: `DEMO_PLUGIN_DIR`, `CONFIG_FILE_NAME`, `DEFAULT_LIBRARY_DIR`, `LIBRARY_DIR_ENV`, `DATABASE_FILE_NAME`, `BOOKS_DIR_NAME`, `COVERS_DIR_NAME`, `PLUGINS_DIR_NAME`. `Layout::default()` в `library/layout.rs` ссылается на `constants`. Доменные контрактные константы (`SCHEMA_VERSION`, `CONTRACT_VERSION` и прочие в `plugin/contract.rs`) остаются в своих модулях — они часть контракта БД/плагинов. Почему не один файл всех констант: контрактные константы должны жить рядом с контрактом, иначе их легко разойтись с описаниями.

### 5. Стиль: согласование `.editorconfig` и rustfmt
Принимается существующий фактический стиль rustfmt (пробелы, ширина строки 100) как источник истины; `.editorconfig` для `*.rs` приводится к `indent_style = space, indent_size = 4`. Добавляется `src-tauri/rustfmt.toml` с настройками (ширина строки, `edition`), фиксирующими стиль и устраняющими расхождение с `.editorconfig`. Альтернатива «перейти на табуляцию через `hard_tabs = true`» отклонена: она переформатирует все diff'ы без выигрыша и противоречит уже принятым коммитам форматирования. Для фронтенда добавляется `.prettierrc` (полуторные кавычки совпадают с текущим кодом, `printWidth: 100` согласован с `.editorconfig` для `*.ts`), скрипты `format:ts`/`check:ts` не меняются.

### 6. Порядок рефакторинга
Сначала вынос моделей и констант (маленькие изолированные перемещения), затем модуль команд, затем тесты, затем стиль и проверки. Каждый шаг завершается успешной сборкой, чтобы регресс локализовался.

## Risks / Trade-offs

- [Риск: `#[path]` сломан в редакторах/IDE при переезде файла] → Проверять `cargo check` и `cargo test` после каждого переноса теста; содержимое теста копируется без правок, кроме заголовка модуля.
- [Риск: развод моделей по файлам разорвёт импорты `use super::*` или `self::`] → Один тип — один файл; переэкспорты в `mod.rs` модуля сохраняют прежние пути импорта (`catalog::entities` уже так работает).
- [Риск: перенос handler-функций команд сломает `generate_handler![]` в `lib.rs`] → Реэкспорт `commands::import_book` через `pub use` в `commands/mod.rs` сохраняет пути; проверить компиляцию и запуск фронтенда.
- [Риск: изменение `.editorconfig` на `space` затронет других редакторов] → Значение фиксируется в `rustfmt.toml`; форматы TS/прочее не меняются.
- Trade-off: группировка приватных DTO в `<модуль>/models.rs` нарушает строгое «один тип — один файл», но сохраняет файловую структуру читаемой при нулевом внешнем эффекте.