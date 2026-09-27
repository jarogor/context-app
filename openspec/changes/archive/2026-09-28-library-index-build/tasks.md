## 1. Механизм миграций схемы

- [x] 1.1 Добавить общий crate миграций в workspace `src-wasm-plugins/`: упорядоченный список `Migration { version, sql }`, применение по `PRAGMA user_version` в транзакции, фиксация версии только при успехе, ошибка/более новая версия — признак полной перестройки; тесты
- [x] 1.2 Подключить crate к `library` и `library-calibre`; заменить «топорное» `CREATE TABLE IF NOT EXISTS` на список миграций (v1 — текущая схема)

## 2. Индекс включает обложку

- [x] 2.1 `library`: миграция v2 с таблицей `covers`; сохранение обложки при индексации из уже извлекаемых метаданных; операция `cover` читает из индекса; обновление/удаление обложки вместе с книгой; тесты
- [x] 2.2 `library-calibre`: миграция v2 с таблицей `covers`; сохранение обложки при индексации; `cover` читает из индекса; тесты

## 3. Прогресс построения индекса

- [x] 3.1 Добавить host-функцию `emit_event` в манифесты source-плагинов (`scripts/build-wasm-plugins.sh`); публиковать `{done, total}` из обоих плагинов во время обработки книг; при актуальном индексе событий нет
- [x] 3.2 UI: показывать определённый прогресс-бар с процентами при открытии библиотеки (`LibrariesPage.svelte`, подписка на событие); тесты

## 4. Документация и проверки

- [x] 4.1 Обновить `_docs/library-index.md` и `_docs/plugin-contract.md` (миграции, обложка в индексе, событие прогресса)
- [x] 4.2 Полный набор: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`
