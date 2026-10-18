## Why

Фронтенд вырос, а его код лежит в одной плоской папке `src/lib/`: 45 файлов
вперемешку — инфраструктура (мост, бутстрап, тема, окно), клиенты базовых
плагинов, встроенные области и рядом тесты. По имени файла нельзя понять
слой и домен, а единственный упорядоченный участок — `src/lib/reader/`. Это
затрудняет навигацию и ведение кода, противоречит принятой в проекте
vertical-slice организации.

## What Changes

Код фронтенда раскладывается по назначению (feature-slice + общий слой):

- `src/app/` — каркас и точка входа: `App.svelte`, `Root.svelte`, `app.css`.
- `src/shared/` — общий слой: `app-bridge.ts`, `window.ts`.
- `src/features/appearance/` — `theme.ts` (+ тест).
- `src/features/library/` — список книг и открытие библиотеки: `LibraryPage.svelte`,
  `LibrariesPage.svelte`, `library.ts`, `app-config.json`.
- `src/features/settings/` — `SettingsPage.svelte`, `AppInfoPage.svelte`,
  `settings.ts` (+ тест).
- `src/features/notifications/` — `NotificationsPanel.svelte`, `notifications.ts`
  (+ тест).
- `src/features/store/` — `StorePage.svelte`, `plugin-store.ts` (+ тест).
- `src/features/workplace/` — `WorkplaceArea.svelte`, `WorkplaceTabs.svelte`,
  `WorkplaceTabPage.svelte`, `OpenBooksPanel.svelte`, `WorkspacesPage.svelte`,
  `workplace.ts`, `workspace-registry.ts` (+ тесты).
- `src/features/reader/` — `reader/` целиком, плюс `ReaderPage.svelte`,
  `BookReader.svelte`, `WorkplaceContent.svelte`, `viewer-bundle.ts` (+ тесты).
- `src/features/notes/` — `notes.ts`, `NotesPanel.svelte` (+ тесты).
- `src/features/lifecycle/` — `bootstrap.ts`, `BootstrapLoading.svelte`,
  `BootstrapError.svelte` (+ тест).
- Удаляется шаблонный мусор: `src/lib/Counter.svelte` и
  `src/assets/{svelte.svg,vite.svg,hero.png}`.
- Обновляются все относительные импорты (компоненты, тесты, точки входа), путь
  `@source` в `app.css` и ссылки на пути в `_docs/`. Внешнее поведение, публичные
  API и набор тестов не меняются.

## Capabilities

Чистый рефакторинг структуры: поведение приложения не меняется, Tauri-команды,
спековые сценарии и данные остаются прежними, спецификационных требований не
вводится и не меняется. Поэтому change объявлен с `skip_specs: true` (по
прецеденту архивных `refactor-code-organization` и `relocate-wasm-plugins`).

### New Capabilities

- (нет — организационный рефакторинг)

### Modified Capabilities

- (нет — поведение на уровне требований не изменяется)

## Impact

- Перемещение файлов внутри `src/`: `src/lib/**` → `src/app`, `src/shared`,
  `src/features/**`; правка относительных импортов в `App.svelte`, `Root.svelte`,
  `main.ts`, компонентах, чистых модулях и тестах.
- `src/app.css` (теперь `src/app/app.css`) — путь `@source` к `packages/ui/src`.
- Удаление `src/lib/Counter.svelte`, `src/assets/svelte.svg`, `src/assets/vite.svg`,
  `src/assets/hero.png` (не используются).
- `_docs/structure.md` — актуализация описания фронтенда.
- Не меняются: конфигурации сборки (`vite.config.ts`, `tsconfig*.json`,
  `vitest.config.ts`, `index.html`, `playwright.config.ts`), внешнее поведение,
  публичные API модулей, состав и имена тестов, `packages/*`.
