## 1. Централизация констант

- [x] 1.1 Создать `src-tauri/src/constants.rs` и объявить `pub mod constants;` в `lib.rs`; перенести туда общие константы: `DEMO_PLUGIN_DIR`, `CONFIG_FILE_NAME`, `DEFAULT_LIBRARY_DIR`, `LIBRARY_DIR_ENV`, `DATABASE_FILE_NAME`, `BOOKS_DIR_NAME`, `COVERS_DIR_NAME`, `PLUGINS_DIR_NAME`; проверка: `cargo check` без ошибок, константы доступны из `crate::constants`
- [x] 1.2 Заменить в `lib.rs`, `config.rs`, `library/mod.rs` локальные константы на импорты из `crate::constants`, убрав дублирование; проверка: `rg "const (DEMO_PLUGIN_DIR|CONFIG_FILE_NAME|DEFAULT_LIBRARY_DIR|LIBRARY_DIR_ENV|DATABASE_FILE_NAME|BOOKS_DIR_NAME|COVERS_DIR_NAME|PLUGINS_DIR_NAME)" grep -v constants.rs` пуст, `cargo test` зелёный

## 2. Разделение моделей по файлам

- [x] 2.1 Вынести `Layout` из `library/mod.rs` в `library/layout.rs` и переэкспортировать в модуле; проверка: `cargo test library` зелёный
- [x] 2.2 Вынести `WrittenFiles` из `import/mod.rs` в `import/models.rs`; проверка: `cargo test import` зелёный
- [x] 2.3 Вынести `ExtractedMetadata` и `CoverData` из `import/epub_parser.rs` в `import/epub_parser/models.rs` и переэкспортировать из `epub_parser`; проверка: `cargo test import` зелёный
- [x] 2.4 Вынести `AppConfig` из `config.rs` в `config/app_config.rs` и переэкспортировать в модуле `config`; проверка: `cargo test config` зелёный
- [x] 2.5 Вынести `FileConfig`/`DataConfig` из `config.rs` в `config/models.rs` и переэкспортировать; проверка: `cargo test config` зелёный
- [x] 2.6 Вынести из `plugin/runtime.rs` модели `HostSink` → `plugin/host_sink.rs`, `LoadedPlugin` → `plugin/loaded_plugin.rs` и переэкспортировать в `plugin/mod.rs`; проверка: `cargo test plugin` зелёный
- [x] 2.7 Вынести `PluginManifest` из `plugin/contract.rs` в `plugin/plugin_manifest.rs`, сохранив в `contract.rs` константы контракта, и переэкспортировать из `plugin/mod.rs`; проверка: `cargo test plugin` зелёный

## 3. Модуль команд

- [x] 3.1 Преобразовать `commands.rs` в директорию `commands/`: `mod.rs` с объявлением подмодулей и компактным перечнем `pub use` четырёх команд и модели; проверка: `lib.rs` продолжает ссылаться на `commands::import_book`, `commands::list_books`, `commands::get_cover`, `commands::get_book_content`, `cargo check` без ошибок
- [x] 3.2 Вынести тело `import_book` в `commands/import_book.rs` с сохранением `#[tauri::command]` и сигнатуры; проверка: `cargo check` зелёный, логика не изменена
- [x] 3.3 Вынести тело `list_books` в `commands/list_books.rs`; проверка: `cargo check` зелёный
- [x] 3.4 Вынести тело `get_cover` в `commands/get_cover.rs`; проверка: `cargo check` зелёный
- [x] 3.5 Вынести тело `get_book_content` в `commands/get_book_content.rs`, а модель `BookContent` — в `commands/content.rs`; проверка: `cargo check` зелёный
- [x] 3.6 Проверить интеграцию команд с фронтендом: собрать приложение (`cargo build`) и выполнить `npm run check` + `npm run build`; проверка: сборка успешна, фронтенд не изменён

## 4. Вынос тестов в отдельные файлы

- [x] 4.1 Вынести `#[cfg(test)] mod tests` из `config/app_config.rs` в `config/_tests.rs` через `#[cfg(test)] #[path = "_tests.rs"] mod tests;`; проверка: `cargo test config` зелёный
- [x] 4.2 Вынести тесты из `library/mod.rs` в `library/_tests.rs` через `#[path]`; проверка: `cargo test library` зелёный
- [x] 4.3 Вынести тесты из `catalog/schema.rs` в `catalog/schema_tests.rs` через `#[path]`; проверка: `cargo test catalog` зелёный
- [x] 4.4 Вынести тесты из `catalog/repository.rs` в `catalog/repository_tests.rs` через `#[path]`; проверка: `cargo test catalog` зелёный
- [x] 4.5 Вынести тесты из `import/mod.rs` в `import/_tests.rs` через `#[path]`; проверка: `cargo test import` зелёный
- [x] 4.6 Вынести тесты из `reading/mod.rs` в `reading/_tests.rs` через `#[path]`; проверка: `cargo test reading` зелёный
- [x] 4.7 Вынести тесты из `plugin/runtime.rs` в `plugin/runtime_tests.rs` через `#[path]`; проверка: `cargo test plugin` зелёный
- [x] 4.8 Вынести тесты из `plugin/plugin_manifest.rs` в `plugin/plugin_manifest_tests.rs` через `#[path]`; проверка: `cargo test plugin` зелёный
- [x] 4.9 Убедиться, что во всех исходных файлах сервисов не осталось инлайн `#[cfg(test)]`/`mod tests`, кроме подключений `#[cfg(test)] #[path=...] mod tests;`; проверка: `rg -n "mod tests" src-tauri/src` показывает только одно подключение на модуль

## 5. Стиль и форматирование

- [x] 5.1 Создать `src-tauri/rustfmt.toml` с настройками стиля (ширина строки 100, отступы пробелами, `edition`), согласованными с `.editorconfig`; проверка: `cargo fmt --all -- --check` завершается успешно после форматирования
- [x] 5.2 Поправить `.editorconfig`: для `*.rs` указать `indent_style = space`, `indent_size = 4`, устранив расхождение с rustfmt; проверка: значения `.editorconfig` согласованы с `rustfmt.toml`
- [x] 5.3 Выполнить `cargo fmt --all`; проверка: `cargo fmt --all -- --check` без изменений, `git diff` содержит только правки форматирования
- [x] 5.4 Создать `.prettierrc` (полуторные кавычки, ширина строки 100, согласование с `.editorconfig` для `*.ts`) и, при необходимости, скорректировать `.editorconfig`/`package.json`; проверка: `npm run check:ts` без ошибок
- [x] 5.5 Выполнить `npm run format:ts` и проверить ревью diff; проверка: `npm run check:ts` зелёный

## 6. Документация и финальная проверка

- [x] 6.1 Обновить `_docs/structure.md`: отразить новую структуру модулей (константы, разнесённые модели, директория `commands/`, вынесенные тесты); проверка: структура в документе совпадает с фактическим деревом `src-tauri/src`
- [x] 6.2 Полный прогон проверок: `cargo test`, `cargo clippy -- -D warnings`, `npm run check`, `npm run build`; проверка: все этапы успешны
- [ ] 6.3 Зафиксировать изменения одним коммитом с описанием рефакторинга; проверка: `git status` чистый, коммит создан без изменения поведения (см. proposal.md — skip_specs)