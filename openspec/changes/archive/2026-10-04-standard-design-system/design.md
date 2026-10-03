## Context

См. `proposal.md` — Why. Текущее состояние (проверено в коде):

- `packages/ui` зависит только от `clsx` и `tailwind-merge`; `bits-ui` и
  `tailwind-variants` отсутствуют.
- Компоненты (`Button`, `Input`, `Textarea`, `Select`, `Checkbox`, `Card`,
  `Badge`, `Progress`, `Menu`/`MenuItem`, `Spinner`, `BookCoverPlaceholder`)
  написаны вручную поверх Tailwind-классов и самодельных токенов
  `--color-*` / `--space-*` / `--radius-*` / `--font-*`.
- Токены используются не только в `packages/ui`, но и в оболочке: `src/app.css`
  и 18 файлов `src/**` (включая `UiRenderer`/`UiNodeView`).
- Активная тема задаётся атрибутом `data-theme="light|dark"` на
  `document.documentElement`; логика в `packages/ui/src/theme.ts`.
- Tailwind подключается через `@tailwindcss/vite` в корне; `src/app.css`
  импортирует `@texture/ui/tokens.css` и `@source '../packages/ui/src'`.

## Goals / Non-Goals

**Goals:**

- Токены по стандартной схеме shadcn-svelte в `oklch`, светлый и тёмный наборы
  официальной темы (базовый цвет — `mist`, ближайший к текущей сине-серой
  палитре), плюс маппинг Tailwind v4 `@theme inline`, чтобы работали утилиты
  вида `bg-background`, `text-muted-foreground`.
- Компоненты `@texture/ui` на примитивах `bits-ui` и вариантах на
  `tailwind-variants` по канону shadcn-svelte; API компонентов и их
  `export`-имена сохраняются, меняется внутренность.
- Сохранить собственную логику темы (`data-theme`, `theme.ts`,
  `applyAppThemeTracked`) — договорённость и тесты остаются.
- Приложение (оболочка и рендерер деклараций) продолжает собираться из тех же
  компонентов и токенов.

**Non-Goals:**

- Оформление содержимого читалки (EPUB/PDF) и обложек.
- Пользовательские темы, редактор палитры, темы из плагинов.
- Переход на CLI-managed workflow (мы храним исходники компонентов у себя — как
  и предполагает shadcn-svelte).
- Новые компоненты сверх нужных текущим поверхностям.

## Decisions

### 1. Базовый цвет темы — `mist`

Актуальный официальный набор базовых цветов shadcn-svelte — `neutral`, `stone`,
`zinc`, `mauve`, `olive`, `mist`, `taupe`; `slate`/`gray` из него исключены.
Текущая палитра обесцвеченная сине-серая; ближе всего по оттенку `mist`
(сине-серый, hue 197–229). Берём официальные значения `mist` для `:root` и
`:root[data-theme='dark']` без ручного подбора. Альтернативы `zinc`/`neutral`
отклонены как менее близкие к текущему интерфейсу.

### 2. Сохраняем `data-theme`, добавляем `@theme inline`

shadcn-svelte по умолчанию переключает тёмную тему классом `.dark`. Чтобы не
ломать `theme.ts` и его тесты, тёмный набор вешаем на `:root[data-theme='dark']`,
а не на `.dark`. Дополнительно добавляем блок `@theme inline`, как требует
Tailwind v4-интеграция shadcn, чтобы утилиты (`bg-primary`,
`text-muted-foreground`, `border-border`, `rounded-lg` и т.д.) ссылались на
токены.

### 3. Стандартные токены + минимальные дополнения

Основной набор — ровно стандартные переменные shadcn
(`--radius`, `--background`, `--foreground`, `--card`, `--popover`, `--primary`,
`--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`,
`--ring` и их `-foreground`). Дополнительно объявляем только те, что реально
нужны поверхностям и отсутствуют в стандарте: `--success`, `--warning` (по
конвенции shadcn «Adding new colors») и мягкие фоны `--primary-soft`,
`--destructive-soft`, `--destructive-border`. Всё лишнее (`--color-bg`,
`--color-surface`, … `--space-*`) удаляем; `--font-sans`/`--font-mono`
остаются — они часть стандартной схемы shadcn и подключаются через
`@theme inline`.

### 4. Компоненты на `bits-ui` + `tailwind-variants`

- `bits-ui` (`^2.19`, Svelte 5) — примитивы с доступностью: `Checkbox`,
  `Progress`; `Menu`/`Select` не переводятся (см. ниже).
- `tailwind-variants` (`^3.3`) — каноничное описание вариантов
  (`buttonVariants`, `badgeVariants` и т.п.) вместо самодельных `Record<string,
  string>`.
- `Select` сейчас — нативный `<select>`. Сохраняем нативный контроль
  (`NativeSelect`-стиль), чтобы не менять поведение и тесты; полноценный
  `Select` на Bits UI — отдельный шаг при необходимости.
- `Menu`/`MenuItem` — это не выпадающее меню, а боковой список-навигация
  (`App.svelte`). Каноничного shadcn-компонента «список-навигация» нет,
  поэтому оставляем собственные семантические элементы (`<nav><button>` на
  стандартных токенах), а не `DropdownMenu` из Bits UI: меню-попап сломало бы
  навигацию по разделам настроек.
- `Checkbox` переводим на примитив `Checkbox` из Bits UI (`button[role=checkbox]`,
  `bind:checked`, `onCheckedChange`), сохраняя публичные `checked`/`disabled`/`id`.
  Потребители пакета передают `onchange` с обращением к `event.currentTarget.checked`;
  компонент сохраняет этот контракт (совместимый объект-событие), чтобы не
  переписывать потребителей и `UiNodeView`.
- `Progress` переводим на примитив `Progress` из Bits UI; сохраняем `value` и
  `role="progressbar"`/`aria-valuenow` для существующих тестов.
- `BookCoverPlaceholder` — прикладной компонент, остаётся как есть (только
  переводится на новые токены).
- Публичные имена и пропсы (`Button`, `variant`, `size`, …) сохраняются, чтобы
  не трогать 18 файлов оболочки сверх замены токенов. API `Checkbox`/`Progress`
  тоже сохраняется на уровне потребителей.

### 5. Маппинг старых токенов на новые

| Было | Стало |
| --- | --- |
| `--color-bg` | `--background` |
| `--color-surface` | `--card` |
| `--color-surface-muted` | `--muted` |
| `--color-text` | `--foreground` |
| `--color-text-muted` | `--muted-foreground` |
| `--color-border` | `--border` |
| `--color-border-strong` | `--input` |
| `--color-primary` | `--primary` |
| `--color-primary-fg` | `--primary-foreground` |
| `--color-primary-soft` | `--primary-soft` |
| `--color-accent` / `--color-accent-soft` | `--accent` / `--muted` |
| `--color-danger` | `--destructive` |
| `--color-danger-soft` | `--destructive-soft` |
| `--color-danger-border` | `--destructive-border` |
| `--color-success` | `--success` |
| `--color-warning` | `--warning` |

`--space-*` заменяются на стандартную шкалу Tailwind; `--radius-sm/md/lg` — на
`--radius` c вычислением (`calc(var(--radius) - 2px)` и т.д.), как в shadcn.

### 6. Обновление потребителей

Замена токенов в `packages/ui` и 18 файлах `src/**` — механическая, по
таблице выше; `src/app.css` переводится на `var(--background)` /
`var(--foreground)` и получает `@theme inline`. Поведение и разметка не
меняются.

## Risks / Trade-offs

- **Палитра визуально изменится** → скриншот-эталоны `tests/e2e` придётся
  пере-эталонировать; это ожидаемо и делается в задачах.
- **`bits-ui` тянет зависимости (`@floating-ui/dom`, `runed`, `svelte-toolbelt`)
  и требует Svelte 5.33+** → в проекте Svelte 5.57, совместимо; размер
  зависимости приемлем ради готовых примитивов.
- **Смена имён токенов может что-то пропустить** → ищем по `--color-`,
  `--space-`, `--radius-`; `svelte-check` и сборка ловят обращения к
  несуществующим классам лишь частично, поэтому добавляем визуальный прогон.
- **`Select` остаётся нативным** → визуально отличается от shadcn-Select; это
  осознанный компромисс (поведение и тесты важнее), отмечено как будущий шаг.
- **Рассинхрон `@theme inline` и токенов** → маппинг один-в-один в
  `tokens.css`, проверяется тем, что компоненты используют семантические
  утилиты.

## Migration Plan

1. Добавить зависимости (`bits-ui`, `tailwind-variants`), обновить `tailwind-merge`
   при необходимости.
2. Переписать `packages/ui/src/tokens.css` на стандартную схему + `@theme inline`.
3. Перевести компоненты на `tailwind-variants` и `bits-ui`.
4. Заменить токены в `src/**` и `src/app.css`.
5. Обновить компонентные тесты, пере-эталонировать скриншоты, прогнать
   `make verify`.
6. Откат: изменение фронтенд-only; вернуть `packages/ui`, `src/**` и
   lock-файлы из git.

## Open Questions

Нет.
