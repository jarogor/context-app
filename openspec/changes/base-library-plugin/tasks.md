## 1. Контракт плагинов v2 (`plugin/`)

- [x] 1.1 В `contract.rs` поднять `CONTRACT_VERSION` до 2 и добавить константы `HOST_FS_LIST_DIR`, `HOST_FS_READ_TEXT`, расширить `HOST_FUNCTIONS`; проверить `cargo test`
- [x] 1.2 В `plugin_manifest.rs` добавить поле `kind` (`extension`/`source`, default `extension`) с валидацией и обновить `plugin_manifest_tests.rs`; проверить `cargo test`
- [x] 1.3 В `runtime.rs` добавить host-состояние с песочным корнем, зарегистрировать host-функции `fs_list_dir`/`fs_read_text`, добавить загрузку из нескольких директорий плагинов и методы опроса source-плагинов (`probe`/`scan`/`scan_book`); проверить `cargo test`
- [x] 1.4 Обновить `runtime_tests.rs` на контракт v2 и новые host-функции; проверить `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`
- [x] 1.5 Пересобрать demo-плагин под контракт v2 (манифест `kind: "extension"`, contract 2), обновить `scripts/build-demo-plugin.sh`, артефакт `resources/plugins/demo-plugin/`; проверить `scripts/build-demo-plugin.sh` и `cargo test`

## 2. Общий модуль `sources/`

- [x] 2.1 Создать `sources/models.rs`: `ExternalBook`, `ExternalFile`, `ExternalFileKind`, `CachedLibrary`; проверить `cargo test`
- [x] 2.2 Создать `sources/index.rs` на `ExternalBook` (индекс, путь-кэш, `cached_libraries`); перенести тесты; проверить `cargo test`
- [x] 2.3 Создать `sources/catalog.rs` на `ExternalBook`; перенести тесты; проверить `cargo test`
- [x] 2.4 Создать координатор `sources/coordinator.rs`: опрос source-плагинов, `probe → scan → книги`, частичный re-scan через `scan_book`; проверить `cargo test`
- [x] 2.5 Переписать потребителей сканера (`library`, `commands`) на `sources/`; проверить `cargo test`, `cargo clippy`, `cargo fmt --check`

## 3. `Library` — generic внешний источник

- [x] 3.1 В `mode.rs` заменить на `Portable | External` (`as_str`: `"portable" | "external"`), `Library` получить поле `source_name`; проверить `cargo test`
- [x] 3.2 Переписать `open`/`open_for_selection`/`prepare_selected`/`promote_external`/`build_external_index`/`sync_if_needed` на координатор источников; проверить `cargo test`
- [x] 3.3 Встроить `PluginRuntime` в `Library` (вместо отдельного managed-состояния) и загружать плагины из `plugins/` + поставляемых `resources/plugins/`, обобщить seed плагинов; проверить `cargo test`, `cargo clippy`, `cargo fmt --check`

## 4. Базовый плагин создания/открытия библиотеки (`src-tauri/library-plugin/`)

- [x] 4.1 Переименовать прототип `calibre-plugin` в `library-plugin`: crate, описание, папка, имя модуля; убрать парсер метаданных OPF и зависимость `quick-xml`; проверить `cargo build --target wasm32-unknown-unknown`
- [x] 4.2 Обобщить сканер: распознавание книг по расширениям файлов в структуре «автор/книга» без требования файла метаданных; метаданные (название, авторы) из имён папок; обложки по имени `cover.*`; проверить нативные тесты
- [x] 4.3 Обобщить `probe`: пригодность корня по наличию книг в структуре «автор/книга», без проверки специфичных файлов формата; перенести `scanner_tests.rs`; проверить тесты плагина
- [x] 4.4 Собрать `invoke`-диспетчер действий `probe|scan|scan_book` и манифест `kind: "source"`, контракт v2; проверить `cargo build --target wasm32-unknown-unknown`
- [x] 4.5 Создать `scripts/build-library-plugin.sh` и артефакт `resources/plugins/library/` (имя источника `library`), удалить старый артефакт `resources/plugins/calibre/`; проверить script и загрузку плагина в `cargo test`

## 5. Команды и фронтенд

- [x] 5.1 `library_info` → `kind: "external"` + `source_name`; блокировки `External` в `import_book`, `get_book_content`; `cached_libraries` из `sources/`; проверить `cargo test`
- [x] 5.2 Обновить `types.ts`, `Library.svelte`, `Reading.svelte` под режим `external` и имя источника без специализации под формат каталога; убрать упоминания источника из тестов ядра; проверить `npm run check` и `npm run build`
- [ ] 5.3 Прогнать все проверки проекта: `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm run build`, `openspec validate --all`

## 6. Документация и OpenSpec

- [x] 6.1 AGENTS.md: раздел «функциональность — только через плагины»; обновить `_docs/plugin-contract.md`, `_docs/structure.md`, `_docs/README.md`; проверить согласованность с контрактом v2
- [x] 6.2 Проверить дельта-спеки и основной набор: `openspec validate --all`