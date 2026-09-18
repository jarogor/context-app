## Why

Приложение — это ядро и плагины, расширяющие его функциональность. Сейчас «портируемый» слой ядра сам открывает библиотеки, сам сканирует директории с книгами, сам строит виртуальный каталог и индексирует книги, а плагины почти ничем не занимаются. По архитектуре сканирование каталога книг, распознавание структуры, построение индекса и его актуализация должны быть реализованы в собственном базовом плагине — «плагине создания/открытия библиотеки», который работает непосредственно с файловой системой и не завязан на конкретный формат каталога.

## What Changes

- **BREAKING** Контракт плагинов v2 (`plugin/`): новое поле манифеста `kind` (`"extension" | "source"`, default `"extension"`), новые host-функции ФС `fs_list_dir` и `fs_read_text`, контрактная версия `2`. Host-функции ФС работают с путями относительно корня библиотеки, только чтение, строго внутри корня.
- **BREAKING** Введён новый тип плагина — «поставщик внешнего источника» (`kind: "source"`). Плагин экспортирует `invoke`, разбирающий действия `probe | scan | scan_book`. Существующий demo-плагин пересобирается под контракт v2.
- Новый общий модуль `sources/` в ядре: модели (`ExternalBook`, `ExternalFile`, `ExternalFileKind`, `CachedLibrary`), индекс-кэш, виртуальный каталог и координатор опроса source-плагинов. Сканер директорий из ядра переносится в плагин.
- **BREAKING** `Library` работает с любым внешним источником: режим `Portable | External`, поле `source_name`, методы `promote_external`, `build_external_index`. Загрузка плагинов из `plugins/` библиотеки + поставляемых `resources/plugins/`.
- Базовый плагин создания/открытия библиотеки (`src-tauri/library-plugin/`): общий сканер директории с книгами (без привязки к конкретному формату каталога), манифест `kind: "source"`, имя источника `library`, артефакт `resources/plugins/library/`, поставляется приложением и добавляется в библиотеку при первом старте.
- Команды и UI: `library_info` возвращает `kind: "external"` + имя источника; блокировки импорта/чтения действуют для режима `External`; `cached_libraries` берётся из `sources/`.
- Документация: AGENTS.md — правило «расширяемость только через плагины»; обновление `_docs/plugin-contract.md`, `_docs/structure.md`, `_docs/README.md`.

## Capabilities

### New Capabilities

- нет новых отдельных capabilities: базовый источник описана в рамках реализации плагина, а общий механизм источников специфицируется изменением `plugin-system`. (Если в ходе реализации потребуется выделить `source-libraries`, планировщик уточнит это в дельта-спеках.)

### Modified Capabilities

- `plugin-system`: контракт v2, тип плагина `source`, host-функции файловой системы с песочницей, source-методы опроса.
- `library-source`: открытие произвольной директории с книгами через базовый source-плагин `library` (probe/scan/scan_book) вместо встроенного сканера ядра; режим `external`.
- `library-index-cache`: индекс-кэш и инкрементальная актуализация переводятся на координатор источников и используют плагин для чтения структуры и метаданных.

## Impact

- `src-tauri/src/plugin/`: `contract.rs`, `plugin_manifest.rs`, `runtime.rs` + тесты.
- `src-tauri/src/library/`: `mode.rs`, `mod.rs` — generic внешний источник; сканирование и распознавание через координатор source-плагинов.
- `src-tauri/src/commands/`: `library_info.rs`, `cached_libraries.rs`, `import_book.rs`, `get_book_content.rs`.
- `src-tauri/src/lib.rs`: загрузка плагинов из двух мест, seed базового плагина + demo.
- Фронтенд: `src/types.ts`, `src/pages/Library.svelte`, `src/pages/Reading.svelte` — режим `external`.
- Новый crate `src-tauri/library-plugin/` (WASM, extism-pdk), скрипт `scripts/build-library-plugin.sh`, ресурсы `src-tauri/resources/plugins/library/`.
- Документация `_docs/`, `AGENTS.md`.