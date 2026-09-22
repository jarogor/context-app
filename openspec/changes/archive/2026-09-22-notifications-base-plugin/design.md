## Context

См. `proposal.md` — Why. Текущее состояние, важное для подхода:

- Ядро (`src-tauri/src/journal/`) владеет журналом, его командами, событием `journal:added` и глобальным handle.
- Host-функция `notify` в `plugin/runtime.rs` пишет напрямую в ядровый журнал; `log` складывает строки в `HostSink`.
- Плагины загружаются только в per-library `PluginSession` (`plugin/session.rs`); app-level runtime отсутствует.
- Frontend-плагины упаковываются по образцу `plugins/library-ui/` (Svelte + Vite + `bridge.ts`, монтируется в iframe через `PluginFrame.svelte`), но сборка знает только `library-ui`.
- `PluginManifest` не содержит поля `kind`, хотя сборочный скрипт уже пишет его в JSON; `serde` молча игнорирует неизвестное поле.

## Goals / Non-Goals

**Goals:**

- Минимальное ядро: только загрузка плагинов, generic transport операций, изоляция и relay событий.
- Журнал уведомлений и его UI полностью принадлежат базовым плагинам (`notifications` WASM + `notifications-ui` frontend).
- App-level runtime базовых плагинов, живущий независимо от сессии библиотеки и переиспользуемый будущими базовыми плагинами (конфиг).
- Живые обновления UI без ядровой модели журнала.

**Non-Goals:**

- Динамическая установка/обновление плагинов из UI — по-прежнему вручную через папки; реестр frontend-плагинов статичен.
- Плагин настроек/конфигов — только закладываем точки расширения, не реализуем.
- Изменение source-lifecycle библиотеки и её плагина.
- Полноценный inter-plugin request/response; уведомления идут односторонним событийным потоком.

## Decisions

### 1. Два уровня плагинов: app-level и session-level

Вводится `plugin::app_host::AppPluginHost`, управляемый как отдельный Tauri state (`Mutex<AppPluginHost>`), рядом с существующим `Mutex<PluginSession>`. AppPluginHost загружает базовые плагины из поставляемой директории `resources/base-plugins/` через тот же `PluginRuntime`. Source/extension-плагины продолжают грузиться в `PluginSession` из `resources/plugins/` и `plugins/` библиотеки.

Альтернатива — грузить базовые плагины в `PluginSession` — отклонена: базовые плагины не должны зависеть от активной библиотеки и перезагружаться при её смене.

Директории разделяются (`resources/base-plugins` vs `resources/plugins`), поэтому дубликатов имён не возникает. `AppPluginHost` дополнительно фильтрует по `kind == "base"`.

### 2. Категория плагина в манифесте

В `PluginManifest` добавляется поле `kind` (`base` | `source` | `extension` | `ui`) с `#[serde(default)]` = `extension` и валидацией значения. Это делает классификацию явной и заменяет неявное поле, которое уже пишет сборочный скрипт.

### 3. Событийный bus как единственный транспорт уведомлений из ядра

Новый модуль `plugin::bus` предоставляет глобальный `EventBus` (`Arc<Mutex<Vec<PluginEvent>>>`), `PluginEvent { level, message, source, details }`. Host-функции `log` и `notify` больше не пишут в журнал, а публикуют `PluginEvent` в bus; `HostSink` и `PluginRuntime::logs()` удаляются.

Доставка выполняется явно: `AppPluginHost::drain_and_deliver()` вынимает накопленные события и для каждого вызывает операцию `publish` плагина, предоставляющего capability `notifications.journal@1`. Вызовы flush происходят:
- после `invoke_plugin_operation` (события, порождённые source-плагином),
- после `invoke_base_plugin_operation`,
- из ядровых точек через `AppPluginHost::notify_user/notify_technical` (публикация + flush).

Это синхронный, детерминированный и тестируемый механизм без фонового потока и без reentrancy: события, порождённые во время доставки, остаются в bus до следующего flush.

Альтернатива — фоновая нить/канал — отклонена из-за сложности разделяемого доступа к Tauri state.

### 4. Маршрутизация по capability

`PluginRuntime` получает метод поиска плагина-провайдера capability и вызов операции по capability (`invoke_capability(capability, action, payload)`). `AppPluginHost` использует его для доставки уведомлений и маршрутизации UI-операций. При отсутствии провайдера событие отбрасывается безвредно.

### 5. Generic relay событий вместо `journal:added`

В контракт добавляется host-функция `emit_event(name, payload_json)`: ядро эмитит Tauri-событие с указанным именем и JSON-payload. Плагин уведомлений при добавлении записи вызывает `emit_event("notifications:added", entry)`. Ядро не знает про журнал — только relay произвольных именованных событий. Frontend-плагин подписывается через существующий `bridge.listen`.

### 6. Плагин уведомлений владеет журналом и хранилищем

`src-wasm-plugins/notifications/` реализует операции: `publish` (level, message, severity, source, details), `list` (фильтр уровня), `mark_read`, `mark_all_read`, `clear`. Журнал сериализуется в служебное состояние plugin-а (`state_write`/`state_read`, ключ `journal.json`), поэтому переживает перезапуск. Логика кольцевого буфера, id и timestamp повторяют текущую ядровую.

Storage root для app-level плагина задаётся ядром при старте (app data dir), а не приходит от клиента.

### 7. Frontend плагин уведомлений и слот в оболочке

`plugins/notifications-ui/` строится по образцу `library-ui` (Svelte, Vite, `bridge.ts`) и получает возможности: базовые операции через новую команду `invoke_base_plugin_operation`, подписку на `notifications:added`. Плагин сам рисует ленту, счётчик и переключатель «Технические».

Оболочка (`App.svelte`) удаляет весь код уведомлений и оставляет слот-регион: `PluginFrame` с `src="/plugins/notifications-ui/index.html"`. Регион управляется сообщениями `layout` от плагина (свёрнутая полоса, развёрнутая панель, страница), чтобы iframe не обрезал панель; размеры региона задаёт оболочка. `build-frontend-plugins.sh` собирает оба плагина.

Альтернатива — transparent-overlay iframe — отклонена: iframe не пропускает события к содержимому под ним.

### 8. Удаление ядрового журнала

Модуль `journal/` целиком удаляется вместе с командами `list_journal`/`mark_read`/`mark_all_read`/`clear_journal`, регистрацией в `lib.rs` и `src/types.ts`. Ядро больше не содержит моделей и хранилища журнала.

## Risks / Trade-offs

- [Синхронный flush может блокировать вызов source-операции на время записи журнала] → запись в память/файл дешёвая; при росте нагрузки flush можно вынести в очередь позже.
- [Плагин уведомлений отсутствует/не загрузился] → bus дренится и очищается, события отбрасываются; работа остальных плагинов не нарушается.
- [Потеря событий при аварийном завершении между publish и flush] → небольшое окно; приемлемо, так как журнал — отладочный инструмент.
- [Усложнение оболочки из-за layout-сообщений] → протокол `layout` минимален (три состояния) и симметричен текущему поведению панели/страницы.
- [Статичный реестр frontend-плагинов] → соответствует non-goal динамической установки; при появлении динамики реестр заменится.

## Migration Plan

1. Добавить `kind` в `PluginManifest` и разделить ресурсные директории; поведение существующих плагинов не меняется (default `extension`).
2. Ввести bus, `emit_event` и app-level runtime; переключить `log`/`notify` на bus.
3. Добавить WASM-плагин `notifications` и собрать артефакты.
4. Добавить frontend-плагин `notifications-ui`; удалить ядровый UI и журнал.
5. Откат: изменение изолировано; при необходимости вернуть модуль `journal` и команды из git.
