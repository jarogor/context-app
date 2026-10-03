## Why

В архивном решении `design-system-foundation` зафиксирована дизайн-система на
**shadcn-svelte (Bits UI + Tailwind v4)**, но реализация ей не соответствует: в
`package-lock.json` нет `bits-ui`, компоненты `@texture/ui` написаны вручную, а
токены — самодельная схема (`--color-bg`, `--color-surface`, …) с произвольными
hex-значениями. Тёмная палитра (`#12151a`) — произвольный подбор без стандарта.
Пользователь ожидал готовую дизайн-систему, а не «велосипед»; нужно привести
пакет к записанному стандарту.

## What Changes

- **BREAKING**: `@texture/ui` переходит на **стандартную схему токенов
  shadcn-svelte** (`--background`, `--foreground`, `--card`, `--popover`,
  `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`,
  `--input`, `--ring`) в `oklch`, со светлым и тёмным наборами официальной темы.
- Подключить **`bits-ui`** (примитивы) и `tailwind-variants`; компоненты
  дизайн-системы перевести на примитивы Bits UI и каноничные варианты shadcn
  (Button, Input, Textarea, Select, Checkbox, Card, Badge, Progress, Menu →
  DropdownMenu, Spinner, BookCoverPlaceholder).
- Обновить потребителей (`src/**`, рендерер деклараций, `UiNodeView`) на новые
  имена токенов.
- Тёмная палитра больше не подбирается вручную: берётся официальный тёмный набор.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `design-system`: требования к компонентам и токенам уточняются — базой SHALL
  быть готовая дизайн-система shadcn-svelte (Bits UI), а токены SHALL
  использовать стандартную схему shadcn, а не произвольные имена и значения.

## Impact

- Пакет `packages/ui`: `package.json` (зависимости `bits-ui`,
  `tailwind-variants`), `tokens.css`, `components/*`, `declarative/*`, `index.ts`.
- Оболочка `src/**` (18 файлов используют токены), `src/app.css`.
- Сборка/зависимости: `package-lock.json`; порядок и команды сборки не меняются.
- Тесты: компонентные тесты `packages/ui`, браузерные сценарии и скриншот-эталоны
  `tests/e2e` (палитра меняется).
- Контракт моста и плагинная архитектура не затрагиваются.
