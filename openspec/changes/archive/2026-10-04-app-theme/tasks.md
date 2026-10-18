## 1. Дизайн-система: тёмные токены и модуль темы

- [x] 1.1 Добавить в `packages/ui/src/tokens.css` тёмный набор токенов под селектором `:root[data-theme='dark']` и синхронизировать `color-scheme` с активной темой; проверить, что `npm test -w @texture/ui` и сборка пакета проходят, а компоненты не содержат новых литералов оформления
- [x] 1.2 Создать `packages/ui/src/theme.ts` с типом предпочтения `light|dark|system`, чистой функцией `resolveTheme(preference, prefersDark)` и применением темы `applyTheme(preference, root?, media?)` (установка `data-theme` и подписка на `prefers-color-scheme` для `system`); покрыть юнит-тестами `resolveTheme` и смену атрибута
- [x] 1.3 Экспортировать модуль темы из `packages/ui/src/index.ts`; проверить, что `npm test -w @texture/ui` проходит и экспорт доступен оболочке

## 2. Ядро: значение темы в настройках и команда чтения

- [x] 2.1 Добавить в `APP_SETTINGS_SCHEMA` (`src-tauri/src/plugin/app_host.rs`) поле-выбор `appearance.theme` со значениями `light`, `dark`, `system` и значением по умолчанию `system`; расширить `app_host_tests.rs` проверкой регистрации поля
- [x] 2.2 Добавить в `AppPluginHost` чтение строкового значения настройки (по аналогии с `app_setting_bool`) и метод `theme_preference()` с приведением неизвестного/отсутствующего значения к `system`; покрыть тестами
- [x] 2.3 Добавить `async` Tauri-команду `theme_preference` (файл в `src-tauri/src/commands/`) и зарегистрировать её; проверить `cargo test`, `cargo clippy` и отсутствие синхронных команд с `Mutex<AppState>`

## 3. Оболочка: применение темы на бутстрапе и при изменении

- [x] 3.1 Создать клиент чтения темы `src/lib/theme.ts`, вызывающий `invokeCommand('theme_preference')` и применяющий тему через `@texture/ui`; покрыть юнит-тестами с мок-мостом
- [x] 3.2 Применять `system` в `src/main.ts` до монтирования приложения, чтобы экран загрузки соответствовал теме ОС; проверить визуально и браузерным тестом
- [x] 3.3 В `src/lib/bootstrap.ts` (`loadBootstrap`) прочитать и применить сохранённую тему; при ошибке оставить `system`, не прерывая вход; расширить `bootstrap.test.ts`
- [x] 3.4 В `src/App.svelte` отслеживать событие `settings:changed`: при изменении секции `app.general` применять новое значение `appearance.theme` без перезапуска; покрыть тестом
- [x] 3.5 Подписаться на изменение темы операционной системы для предпочтения `system` и снимать подписку при смене предпочтения; покрыть тестом `applyTheme`

## 4. Автоматические проверки

- [x] 4.1 Добавить браузерный тест (Playwright, мок-мост): выбор тёмной темы меняет `data-theme` корня и цвет области; `npm run test:e2e` проходит
- [x] 4.2 Проверить контраст тёмных токенов: страница настроек и верхняя панель отображаются без «белых пятен» в тёмной теме; зафиксировать скриншотной проверкой
- [x] 4.3 Прогнать `make verify` и убедиться, что все проверки проходят без ошибок и предупреждений

## 5. Документация и решения

- [x] 5.1 Обновить `_docs/structure.md` (модуль темы в дизайн-системе и его применение на бутстрапе); проверить актуальность описания
- [x] 5.2 Записать решение (тема — шов оформления, значения `light|dark|system`, читалка вне темы) в «Журнал решений» `ROADMAP.md`; отметить прогресс в строке тем

## 6. Палитры оформления (Gruvbox) и переключатель в шапке

- [x] 6.1 Переписать `packages/ui/src/tokens.css`: палитра по умолчанию Gruvbox (светлый набор в `:root`, тёмный в `:root[data-theme='dark']`, официальные цвета) и палитра Mist (селекторы `:root[data-palette='mist']` и `:root[data-palette='mist'][data-theme='dark']`); производные `color-mix` — общие
- [x] 6.2 Создать `packages/ui/src/palettes.ts` (реестр палитр `gruvbox`/`mist`, `DEFAULT_PALETTE`, `applyPalette`, нормализация), покрыть тестами и экспортировать из `index.ts`
- [x] 6.3 Добавить поля `appearance.palette` в `APP_SETTINGS_SCHEMA`, чтение `theme_palette()` в `AppPluginHost` и `async` команду `theme_palette`; покрыть тестами Rust
- [x] 6.4 Расширить `src/lib/theme.ts` чтением/применением палитры и разбором события `settings:changed`; обновить `bootstrap.ts` (прочитать тему и палитру параллельно, вернуть `appearance`) и `Root.svelte`/`App.svelte` (проп `initialAppearance`)
- [x] 6.5 Добавить в шапку `App.svelte` кнопку-цикл темы (`light` → `dark` → `system`, иконка по текущей) с сохранением через `saveSettingsValues`; синхронизировать состояние с событием `settings:changed` (палитра применяется оттуда же)
- [x] 6.6 Привести статичный экран `index.html` и фон окна `show_window.rs` к палитре Gruvbox; выставить `data-palette` до первого кадра в `src/main.ts`
- [x] 6.7 Обновить тесты: `packages/ui` (палитры), `src/lib/theme.test.ts`, `src/lib/bootstrap.test.ts`, мок-мост и браузерный `theme.spec.ts`; `npm test` и `npm run test:e2e` проходят
- [x] 6.8 Ужесточить порог визуальной регрессии (`maxDiffPixelRatio` 0.002) и пере-эталонировать скриншоты под Gruvbox; `visual.spec.ts` проходит
- [x] 6.9 Обновить спеки `design-system`/`settings`/`app-shell`, `_docs/structure.md`, `AGENTS.md` и «Журнал решений» `ROADMAP.md`; `make verify` проходит
- [x] 6.10 Смягчить границы интерфейса: задать цвет границ по умолчанию из токена `--border` в базовом слое `src/app.css` (в Tailwind v4 `border` без цвета берёт `currentColor`) и сделать `--border`/`--input`/`--sidebar-border` gruvbox смесью переднего плана с фоном; пере-эталонировать скриншоты
