## 1. SQL-хранилище в ядре

- [x] 1.1 Добавить `rusqlite` (bundled) в `src-tauri/Cargo.toml`, объявить имена и сигнатуры host-функций `sql_execute`/`sql_query` в `contract.rs`, включить их в `HOST_FUNCTIONS`
- [x] 1.2 В `plugin/runtime.rs` добавить в `HostState` путь к SQLite-базе (`storage_root/<plugin_id>/<sha256(канонический sandbox_root)>/index.sqlite`) и ленивое соединение под мьютексом; регистрировать host-функции при загрузке плагина; покрыть тестами (успех, ошибка SQL, отсутствие сессии)
- [x] 1.3 Расширить `fs_list_dir`: для файловых записей возвращать `size` и `mtime_ms` (без чтения содержимого; `null` при недоступности); обновить host-функцию и тесты

## 2. Перевод source-плагинов на SQLite

- [x] 2.1 Generic-плагин `library`: схема и миграции индекса (`PRAGMA user_version`), сохранение каталога и метаданных файлов (путь, размер, mtime), инкрементальный скан при открытии (перечитывать только новые/изменённые, удалять исчезнувшие); тесты
- [x] 2.2 Плагин `library-calibre`: перевод persisted-состояния на тот же SQL host API с инкрементальной актуализацией; тесты
- [x] 2.3 Отказ от JSON-состояния: несовместимое/устаревшее состояние игнорируется и перестраивается; внешняя библиотека остаётся read-only

## 3. Документация и проверки

- [x] 3.1 Обновить `_docs/plugin-contract.md`, `_docs/plugin-architecture.md`, `_docs/library-index.md` (SQL host API, метаданные `fs_list_dir`, расположение базы); при необходимости `AGENTS.md`
- [x] 3.2 Полный набор: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`
