## 1. Backend journal implementation

- [x] 1.1 Создать модуль `src-tauri/src/journal/mod.rs` с типом `Entry`, `Level`, `Severity`, `Journal` (bounded VecDeque), реализовать инкрементный id и timestamp
- [x] 1.2 Реализовать методы `Journal::new`, `Journal::add_user`, `Journal::add_technical`, `Journal::all`, `Journal::mark_read`, `Journal::clear`
- [x] 1.3 Добавить команду `list_journal` в Tauri handlers, возвращающую отфильтрованный список записей
- [x] 1.4 Добавить команду `mark_read` в Tauri handlers, принимающую ids записей и помечающих их прочитанными
- [x] 1.5 Добавить команду `clear_journal` в Tauri handlers, очищающую весь журнал
- [x] 1.6 Добавить событие `journal:added` в Tauri, эмитируемое при каждой добавленной записи
- [x] 1.7 Создать модуль `src-tauri/src/journal/entry.rs` с DTO для Entry, Level, Severity (или встроить в мод.rs)
- [x] 1.8 Создать модуль `src-tauri/src/journal/handle.rs` с глобальным `JournalHandle` (OnceLock), методом `new` и `new_noop()` для тестов, инъектировать в Library и команды
- [x] 1.9 Добавить тесты в `journal/_tests.rs` для основных операций (add, all, mark_read, clear, bounded)

## 2. Wiring events to journal

- [x] 2.1 Заменить `eprintln!("[library] watcher ready")` в `library/mod.rs:179` на `journal_handle.add_technical("watcher ready", root.display())`
- [x] 2.2 Заменить `eprintln!("[library] cached catalog")` в `library/mod.rs:252` на `journal_handle.add_technical("cached catalog", root.display())`
- [x] 2.3 Заменить `eprintln!("[library] scan")` в `library/mod.rs:262` на `journal_handle.add_technical("scan", scanned.len())`
- [x] 2.4 Заменить `eprintln!("[library] index")` в `library/mod.rs:274` на `journal_handle.add_technical("index", root.display())`
- [x] 2.5 Заменить `eprintln!("[library] scan book directory")` и ретраи в `library/mod.rs:340-356` на технические записи с severity Info/Warn/Error
- [x] 2.6 Добавить эиссию пользовательских событий в `library/mod.rs` после `prepare_selected`, `build_calibre_index`, `sync_if_needed`
- [x] 2.7 Добавить эиссию событий `library.opened`, `calibre.cache_hit`, `calibre.scanned`, `calibre.index_created`, `calibre.index_updated`, ошибок в `library/mod.rs`
- [x] 2.8 Заменить `eprintln!("[plugins] плагин загружен")` в `lib.rs:47` на `journal_handle.add_technical("plugin loaded", name)`
- [x] 2.9 Заменить `eprintln!("[plugins] demo-plugin ответил")` в `lib.rs:51-52` на технические записи
- [x] 2.10 Интегрировать `HostSink` из `plugin/host_sink.rs`: в `plugin/runtime.rs` после получения сообщений вызывать `journal_handle.add_technical` с текстом из HostSink
- [x] 2.11 Добавить эиссию событий импорта в `commands/import_book.rs` (успех/ошибка)
- [x] 2.12 Инъектировать `JournalHandle` в `Library::open`, `prepare_selected`, `build_calibre_index`, `sync_if_needed` через поле, добавить поле в структуру Library

## 3. Frontend UI for notifications

- [x] 3.1 Создать компонент `src/lib/NotificationsPanel.svelte` с полями: `entries`, `technicalVisible`, `markAllRead`, `clear`, типы DTO из библиотеки
- [x] 3.2 Реализовать логику просмотра/свертывания панели на десктопе, отметку всех прочитанных при развёртывании
- [x] 3.3 Добавить адаптивный layout: при ширине >= 900px — панель слева, по умолчанию свёрнута в узкую полосу; при < 900px — отдельная страница
- [x] 3.4 Создать страницу `src/pages/Notifications.svelte` для мобильного/узкого окна, добавить счётчик в заголовок
- [x] 3.5 Подключить listen на событие `journal:added` в App.svelte для live-обновления ленты
- [x] 3.6 Подключить команды `list_journal`, `mark_read`, `clear_journal` через `invoke` из App.svelte
- [x] 3.7 Добавить тумблер «Технические» и логику переключения `technicalVisible` в `NotificationsPanel` и `Notifications.svelte`
- [x] 3.8 Обновить App.svelte: добавить `<NotificationsPanel />` в layout, обновить контекст, если панель свёрнута/развёрнута, передавать флаг `markAllRead`
- [x] 3.9 Добавить кнопку «Очистить» в UI
- [x] 3.10 Реализовать локальное хранилище для флага `technicalVisible` (localStorage) для сохранения между запусками
- [x] 3.11 Добавить анимацию появления записей и анимацию отметки прочитанных для улучшения UX

## 4. Integration and testing

- [x] 4.1 Протестировать базовые сценарии из spec (открытие библиотеки, кэш, скан, индекс, ошибки) в интеграции
- [x] 4.2 Протестировать поведение счётчика: непрочитанные, автоматическое чтение при разворачивании, новые записи
- [x] 4.3 Протестировать технический уровень: показ/скрытие записей, фильтрация
- [x] 4.4 Протестировать десктоп vs мобильный layout в разных ширинах окна
- [x] 4.5 Протестировать очистку журнала через UI
- [x] 4.6 Запустить `cargo test` и убедиться, что все тесты проходят
- [x] 4.7 Запустить `cargo clippy --all-targets -- -D warnings` и убедиться, что предупреждений нет
- [x] 4.8 Запустить `cargo fmt --all -- --check` и убедиться, что форматирование корректное
- [x] 4.9 Запустить `npm run check` и `npm run build` в фронтенде
- [x] 4.10 Запустить `openspec validate --all` и убедиться, что спецификации валидны

## 5. Доработка: адаптивный UI и устранение шума уведомлений

- [x] 5.1 Убрать User-уведомление «Библиотека открыта из кэша»: при неизменном индексе только техническая запись
- [x] 5.2 Гарантировать отсутствие переиндексации и уведомлений при шумных событиях вне папок книг (скрытые/корневые пути)
- [x] 5.3 Рендерить панель уведомлений только на десктопе (>= 900px), страницу — только на мобильном (< 900px)
- [x] 5.4 Заменить кнопку-текст в Library на кликабельный счётчик, видимый только на мобильном
- [x] 5.5 Реализовать возврат со страницы уведомлений на страницу-источник
- [x] 5.6 Убрать дублирующую логику журнала из Library.svelte (счётчик через props из App.svelte)
- [x] 5.7 Обновить spec.md и design.md под новую политику уведомлений и адаптивность
