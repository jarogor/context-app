## Context

См. `proposal.md` — Why. Проект состоит из трёх слоёв кода: ядро Rust
(`src-tauri/`, ~9 тыс. строк), WASM-плагины (`src-wasm-plugins/`, ~11 тыс.
строк) и фронтенд (`src/` + `packages/`, ~18 тыс. строк). Внешнее поведение
приложения фиксируют активные спеки `openspec/specs/**`; их требования это
изменение не затрагивает.

Наблюдаемое состояние (проверено):

- `cargo clippy` по ядру проходит **без предупреждений**, маркеров
  `TODO/FIXME/HACK` и `#[allow(dead_code)]` нет — мёртвый код не помечен.
- Дублирование подтверждено фактами: 4 копии атомарной записи JSON, 4 копии
  чтения JSON, идентичные `kind_name` (`discovery.rs`/`package.rs`), 21 копия
  boilerplate-замка `Mutex<AppState>` в `commands/*`, у `library` и
  `library-calibre` совпадают целые файлы (`test_sql.rs`, `migrations/v2.rs`),
  у базовых плагинов совпадает трейт `Host` и его реализация.
- Крупные файлы: `src-tauri/src/plugin/runtime.rs` (1669),
  `src/app/App.svelte` (1609), `src/features/reader/BookReader.svelte` (1580),
  `src/features/notes/notes.ts` (825), `src/features/notes/NotesPanel.svelte`
  (433), `src/features/reader/ReaderPage.svelte` (520).
- Компоненты `library` и `library-calibre` — отдельные крейты в одном
  workspace (`src-wasm-plugins/Cargo.toml`), сборка артефактов — через
  `make plugins` / `scripts/build-wasm-plugins.sh`, артефакты не в git.
- Проверки: единая точка входа `make verify`; заявленные e2e-снапшоты Playwright
  — визуальный эталон.

## Goals / Non-Goals

**Goals:**

- Устранить подтверждённое дублирование через общие модули/крейты.
- Удалить подтверждённо неиспользуемый код и сузить избыточно широкие API.
- Разбить крупные файлы на модули по ответственностям, не меняя поведение.
- Выполнить локальные оптимизации горячих путей (эквивалентные
  преобразования) и выровнять имена/комментарии.
- Сохранить внешнее поведение, контракты (Tauri-команды, WASM host-функции),
  форматы хранения и UI. Покрытие продакшн-поведения тестами сохраняется;
  тесты, существовавшие только для удаляемых тест-онли API, удаляются вместе с
  ними (решение принято пользователем в пользу буквального `tasks.md`).

**Non-Goals:**

- Не менять бизнес-логику и наблюдаемое поведение; не менять спеки.
- Не менять зависимости, стек и конфигурации сборки.
- Не переносить функциональность между слоями (только выделение общего кода).
- Не «оптимизировать» ценой смены семантики (порядок побочных эффектов,
  формат данных, публичные типы).
- Не трогать архивные изменения и `_docs` как источник истины.

## Decisions

### 1. Изменение объявлено `skip_specs: true`

Спецификации описывают поведение, а поведение не меняется — это чистый
рефакторинг. Прецедент: архивные `2026-10-04-frontend-structure`,
`relocate-wasm-plugins`. Поэтому `specs/**` не создаётся, а требование
`openspec validate` снимается маркером `skip_specs: true` в `.openspec.yaml`.
Альтернатива — завести «требование» ради валидации — отклонена: это
искусственное требование без наблюдаемого эффекта.

### 2. Общий крейт `source-common` для `library` и `library-calibre`

Вынести в общий крейт `src-wasm-plugins/` то, что сейчас дословно скопировано:
модели (`ExternalBook`/`ExternalFile`/`DirEntry`/`SourceCapabilities`/
`SourceCatalog`), трейт `Fs` и `HostFs`, epub/xml-хелперы, каркас SQL-индекса
(схема, миграции, ревизия, `emit_progress`), `Request`/`OpenResponse`,
`library_label`/`indexed_message`, `emit_notification`. `library-calibre`
оставляет только специфику (`scanner`, `opf`, раскладка). Альтернатива —
оставить копии — отвергнута: идентичные `test_sql.rs` и `migrations/v2.rs`
уже расходятся по мере правок, а это скрытый источник ошибок.

### 3. Общий крейт `plugin-host` для базовых плагинов

Трейт `Host` (`state_read`/`state_write`/`emit_event`/`now_millis`), его
реализация поверх `extism_pdk::host_fn`, шаблон `Request`/`dispatch` и
«состояние из `state_read` → `from_str` / `to_string` → `state_write`»
совпадают в `notes-store`, `notifications`, `settings`, `plugin-store`.
Выносим в общий крейт; плагины оставляют свою модель и действия. Альтернатива
— расширять `ui-sdk` (он про UI, не про host) — отвергнута.

### 4. Разбиение `runtime.rs` на подмодули `plugin/runtime/`

`PluginRuntime` держит смешанные ответственности: загрузку плагинов, вызов
плагина/трассировку, host-функции (`log`/`notify`/`fs`/`state`/`sql`/`store`) и
резолв sandbox-путей. Делим на `runtime/mod.rs` (тип и вызов), `runtime/load.rs`,
`runtime/trace.rs`, `runtime/host/{log,fs,state,sql,store}.rs`,
`runtime/host_state.rs` (тип `HostState`, SQLite, резолв корней) и
`runtime/host/registration.rs` (регистрация host-функций). Публичный API
`PluginRuntime` не меняется — это внутренняя раскладка. Заодно общие поля
`PluginRuntime`/`HostState` сводятся в один `RuntimeRoots`, что снимает два
`#[allow(clippy::too_many_arguments)]`.

### 5. Общие хелперы ядра

- `atomic_write_json`/`read_json_or_default` — один модуль; заменяют 4+3 копии
  в `activation.rs`, `workspace_state.rs`, `library_history.rs` и host-функции
  `state_write`/`state_read`. Host-функция отображает `io::Error` в
  `extism::Error`.
- `paths.rs` — `project_root()`, dev-каталоги плагинов; заменяет дублирование
  `CARGO_MANIFEST_DIR.parent()` в `lib.rs` и `session.rs`.
- `PluginKind::as_str()`/`Display` — вместо копий `kind_name`.
- `PluginError::runtime(...)`/`call(...)` — вместо 6 копий обёртки.
- `HostState::storage_root()` и одна `is_safe_relative_path` — вместо вариаций
  проверки «безопасного относительного пути».

### 6. Хелперы команд ядра

`commands/mod.rs` получает `lock_state(...)` (21 копия boilerplate) и
`AppState::disabled_plugins()`; повтор блока «перечитать реестр настроек и
опубликовать событие» сводится к `AppState::after_session_reload()`.

### 7. Фронтенд: общие модули вместо копий

- `shared/path.ts` (`lastSegment(path, {stripExt})`) — вместо 4 копий разбора
  последнего сегмента пути.
- Общий клиент base-плагина (`basePluginOperation`) — вместо 4 wrapper'ов
  (`notes`, `settings`, `notifications`, `plugin-store`); общий `activeLibrary()`.
- `shared/format.ts` — единственный источник дат (в т.ч. время для уведомлений);
  убирается обёртка `formatNoteDate` и локаль окружения.
- Общие UI-примитивы `@texture/ui`: `ErrorToast`, `EntityList` (список из
  `ListRow` + `MetaList` + `ActionMenu`), `IconButton` (свод `AddButton`/
  `EditButton`/`DeleteButton`), хелпер async-состояния (`загрузка/ошибка/пусто`).

### 8. Фронтенд: разбиение крупных файлов

- `App.svelte`: логика заметок выносится в контроллер
  (`features/notes/notes-controller.svelte.ts`), открытие книги — в модуль,
  навигация/видимость — в `shell`-модуль; prop-drilling заметок замещается
  контекстом.
- `BookReader.svelte`: `reader-document.ts` (HTML/CSS документа),
  `note-editing` (move/resize), `gestures` (создание заметок),
  `zoom-anchor` (удержание места).
- `notes.ts`: `notes/model.ts`, `notes/client.ts`, `notes/view.ts`.
- `ReaderPage`/`NotesPanel`/`LibraryPage`/`WorkplaceContent`: выделение
  пагинации, меню, протокола postMessage.

### 9. Точечные оптимизации (эквивалентные преобразования)

Ядро: кэш канонизированного sandbox-root (инвалидация в `set_sandbox_root`),
`entry()`-lookup кэша вложений, гейт построения payload трассировки по уровню
лога, `HashSet` для disabled-плагинов. WASM: неполный `SELECT` в `load_rows`,
снятие двойной сериализации в `upsert`, однократная нормализация в
`notes-store`, отказ от клонирования всего каталога в `lifecycle::catalog`,
реже `emit_progress`. Фронтенд: debounce поиска, параллельная загрузка
обложек, инкрементальное обновление подсветок, ленивая сериализация реестра.
Каждое изменение обязано сохранять наблюдаемое поведение и подтверждаться
штатными проверками.

### 10. Порядок работ — от низкого риска к высокому

Сначала удаление мёртвого кода и сужение API, затем общие хелперы, затем
разбиение файлов, затем оптимизации и имена. Каждый блок завершается
зелёным `make verify`, поэтому регрессию локализует ближайший шаг. Альтернатива
— «большими шагами» — отвергнута: трудно локализовать источник регрессии.

## Risks / Trade-offs

- [Регрессия при разбиении файлов или выносе модулей] → Инкрементальные шаги,
  после каждого — `make verify`; e2e-снапшоты Playwright должны совпасть с
  зафиксированным в начале эталоном.
- [Новые крейты в WASM-l workspace меняют сборку плагинов] → Опоры на
  `make plugins` и `check-artifacts`; сборка и артефакты проверяются в
  `make verify`.
- [Обобщение `Host` может «размыть» приватность и потянуть лишние связи] →
  Минимальный общий контракт; плагин-специфичное остаётся в плагине;
  публичные API крейтов — `pub(crate)` по умолчанию.
- [Удаление «мёртвого» кода, который на деле тест-хук или задел] → Решение
  пользователя: удаляем буквально по `tasks.md` — тест-онли API и их тесты
  удаляются (`filterNotes`, `ensureDefaultSet`, `updateNoteText`,
  `supportedFormats`; WASM `sets`/`version`/`len`/`is_empty`/`find`/
  `book_from_file`/`ui-sdk::text`/`ui-sdk::child`). Покрытие продакшн-поведения
  не теряется: удаляются только тесты удаляемых API. Спорное по-прежнему
  фиксируем решением, не угадываем.
  Пример обязательной перепроверки: ветки заметок `text`/`shape` во фронтенде
  сначала показались недостижимыми, но `allowedNoteTypes` включается для
  страничного режима — эти ветки живые и не удаляются.
- [Оптимизации меняют порядок побочных эффектов] → Только эквивалентные
  преобразования; поведенческие тесты и e2e — критерий.
- [Незавершённое изменение из-за объёма] → Явный порядок и отдельные задания;
  изменение можно безопасно остановить после любого зелёного блока.

## Open Questions

Нет — развилки, влияющие на состав задания, разрешены выше.
