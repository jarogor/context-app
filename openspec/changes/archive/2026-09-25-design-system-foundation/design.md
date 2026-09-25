## Context

См. `proposal.md` — Why. Состояние, важное для подхода:

- Пять независимых Vite-приложений: корень (оболочка, `src/`) и четыре плагина
  (`plugins/*`), у каждого свой `package.json` и `node_modules`; npm workspaces
  нет.
- Svelte 5, Vite 8, TypeScript; сборка плагинов — `scripts/build-frontend-plugins.sh`
  (check + build + копирование `dist` в `public/plugins/<name>`), оттуда их грузит
  оболочка в `<iframe>`.
- Мост `PluginFrame.svelte` relay'ит `invoke`, `dialog.open`, `listen`; компоненты
  плагинов общаются через `postMessage` (`bridge.ts`).
- Стили: несколько CSS-переменных в `src/app.css` и scoped-стили в компонентах;
  Tailwind и тестов UI нет.
- Tauri-сборка: `beforeBuildCommand: npm run build` → `build:plugins` (WASM) +
  `build:frontend-plugins` + `vite build` (оболочка) → `dist`.

## Goals / Non-Goals

**Goals:**

- Общая фронтенд-инфраструктура: npm workspaces, `packages/ui`, `packages/ui-schema`.
- Дизайн-система на shadcn-svelte (Bits UI + Tailwind v4) с токенами как швом тем.
- Оболочка и все frontend-плагины строят UI из общих компонентов и токенов.
- Воспроизводимый тестовый стенд: компонентные (Vitest) и браузерные (Playwright)
  тесты без запуска Tauri.

**Non-Goals:**

- Изменение модели плагинов, декларативный UI, рендерер, Rust-ядро и WASM.
- Читалки, библиотека, заметки и прочие продуктовые поверхности.
- Темы как пользовательская фича (сейчас только шов — токены).
- Полный перенос всех существующих стилей «до последнего пикселя» — базовый набор.

## Decisions

### 1. npm workspaces

Корень (`jarogor-booklib`) остаётся корневым пакетом и приложением оболочки;
члены — `plugins/*` и `packages/*`. Один `package-lock.json`, версии hoisted.
Пакеты подключаются по имени (`@booklib/ui`, `@booklib/ui-schema`,
`@booklib/testing`) через workspace-симлинки. Альтернатива — без workspaces,
дублирование — отклонена: ради неё и затевается фундамент.

```text
jarogor-booklib/            (root, shell app, src/)
├── packages/
│   ├── ui/                 дизайн-система: компоненты + tokens.css
│   ├── ui-schema/          типы будущего UI-дерева (скелет, без рендера)
│   └── testing/            мок моста Tauri + тест-утилиты
└── plugins/                library-ui, notifications-ui, settings-ui, plugin-store-ui
```

### 2. Дизайн-система: shadcn-svelte + Tailwind v4

`packages/ui` содержит компоненты shadcn-svelte (исходники `.svelte` экспортируются
из пакета) и `tokens.css`. Tailwind v4 — CSS-first: приложения импортируют
`@booklib/ui/tokens.css` и свой Tailwind-энтри. Компоненты остаются «в нашем коде»
(как у shadcn), поэтому эстетику потом правим точечно, не меняя зависимости.

Чтобы Vite компилировал `.svelte` из workspace-пакета, приложения исключают пакет
из пред-бандлинга и обрабатывают его как исходник (настройка `optimizeDeps`/`noExternal`).

### 3. Токены — CSS-переменные, один источник

Единый `packages/ui/tokens.css` задаёт дизайн-токены (`--color-*`, `--radius-*`,
`--space-*`, типографику). Компоненты используют только токены; хардкод цветов и
размеров запрещён. Каждое приложение (и оболочка, и каждый плагин) импортирует
`tokens.css`, поэтому внутри iframe токены те же. Динамическая смена темы во
время работы (рассылка токенов в iframe) — будущий шаг, сейчас только шов.

### 4. `packages/ui-schema` — только скелет

Типы и черновой JSON-словарь будущего декларативного UI (узлы, свойства,
события, версия схемы) без рендерера и протокола. Нужен, чтобы следующие change
опирались на зафиксированные типы, а не начинали с нуля. Реализацию рендера и SDK
не делаем.

### 5. Тестовый стенд

- **Компоненты:** Vitest + `@testing-library/svelte` (jsdom). Тесты в `packages/ui`
  и в приложениях; окружение без Tauri.
- **Браузерные сквозные:** Playwright. `webServer` поднимает `vite` dev-сервер;
  тесты открывают оболочку, взаимодействуют с ней и с содержимым iframe через
  `frameLocator`, снимают эталонные скриншоты для визуальной регрессии.
- **Мок моста:** `packages/testing` предоставляет мок `invoke`/`dialog.open`/`listen`
  с фикстурами. В браузерном режиме `PluginFrame`/`bridge` используют мок вместо
  Tauri (по env-флагу), поэтому тесты не требуют десктопа.

### 6. Сборка

`scripts/build-frontend-plugins.sh` адаптируется под workspaces: установка
зависимостей один раз на root, затем check+build каждого плагина (через
`npm run build -w plugins/<name>`), копирование `dist` в `public/plugins/<name>`.
Корневой `npm run build` сохраняет порядок: WASM-плагины → frontend-плагины →
`vite build` оболочки.

## Risks / Trade-offs

- [Tailwind v4 + Svelte-исходники из workspace] → пред-бандлинг исключается, пакет обрабатывается как исходник; проверяется на первом же приложении.
- [Токены в iframe статичны] → на этом этапе копируются сборкой; динамическая тема — отдельный будущий change.
- [Миграция четырёх плагинов раздувает объём] → ограничиваемся базовым набором компонентов и заменой кастомных стилей, не доводя до идеала.
- [Playwright и iframe/postMessage] → тайминги и `frameLocator`; покрываем 1-2 сценария, не все.
- [Workspaces и упаковка Tauri] → доставка через `public/plugins` не меняется, Tauri-ресурсы не затрагиваются.

## Migration Plan

1. Ввести workspaces и заготовки `packages/ui`, `packages/ui-schema`, `packages/testing`.
2. Реализовать токены и базовый набор компонентов в `packages/ui`.
3. Перевести оболочку (`src/App.svelte`, `PluginFrame`) на дизайн-систему.
4. Перевести frontend-плагины на дизайн-систему по одному.
5. Поднять тестовый стенд: Vitest + Playwright + мок моста; примеры тестов.
6. Обновить скрипты сборки и документацию.
7. Откат: изменение фронтенд-only; вернуть прежние стили и конфиги из git.

## Open Questions

- Точный минимальный набор компонентов (кнопка, поле, select, checkbox, меню,
  панель/карточка, индикатор) — уточняется при реализации, на контракт не влияет.
- Где размещать скриншот-эталоны Playwright и порог допуска — деталь тестового
  стенда.
