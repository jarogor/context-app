## 1. Зависимости

- [x] 1.1 Добавить в `packages/ui` зависимости `bits-ui` (^2.19) и `tailwind-variants` (^3.3); при необходимости поднять `tailwind-merge` до совместимой версии; `npm install` проходит
- [x] 1.2 Убедиться, что `npm run check`, `npm test` и сборка проходят с новыми зависимостями до изменения кода

## 2. Токены по стандарту shadcn-svelte

- [x] 2.1 Переписать `packages/ui/src/tokens.css` на стандартную схему (`--background`, `--foreground`, `--card`, `--popover`, `--primary`, `--secondary`, `--muted`, `--accent`, `--destructive`, `--border`, `--input`, `--ring`, `--radius` и `-foreground`-пары) в `oklch`; светлый набор в `:root`, тёмный — в `:root[data-theme='dark']`; базовый цвет — `mist`
- [x] 2.2 Добавить только отсутствующие в стандарте токены, реально нужные поверхностям: `--success`, `--warning`, `--primary-soft`, `--destructive-soft`, `--destructive-border` (для светлого и тёмного наборов)
- [x] 2.3 Добавить блок `@theme inline` (маппинг токенов в утилиты Tailwind v4: `--color-background`, `--color-foreground`, `--color-primary`, `--radius-*` и т.д.); проверить, что утилиты вида `bg-primary`/`text-muted-foreground` работают

## 3. Компоненты на Bits UI и tailwind-variants

- [x] 3.1 Перевести `Button`, `Badge`, `Card`, `Input`, `Textarea`, `Progress`, `Spinner`, `BookCoverPlaceholder` на новые токены и `tailwind-variants`; публичные имена и пропсы сохранить
- [x] 3.2 Перевести `Checkbox` и `Progress` на примитивы Bits UI, сохранив публичный контракт потребителей; `Menu`/`MenuItem` оставить семантической навигацией (не `DropdownMenu`) на стандартных токенах
- [x] 3.3 Оставить `Select` нативным (`NativeSelect`-стиль) на новых токенах; поведение и тесты не менять
- [x] 3.4 Обновить декларативный рендерер (`UiRenderer`/`UiNodeView`) под новые компоненты и токены без изменения схемы `ui-schema`

## 4. Потребители в оболочке

- [x] 4.1 Перевести `src/app.css` на `var(--background)`/`var(--foreground)` и подключить `@theme inline` (если не подхватывается из токенов)
- [x] 4.2 Заменить токены во всех файлах `src/**` (18 файлов) по таблице маппинга из `design.md`; литералов оформления не добавлять
- [x] 4.3 Проверить отсутствие обращений к удалённым токенам (`--color-*`, `--space-*`, `--radius-sm/md/lg`) в `src/**` и `packages/**`

## 5. Тесты и эталоны

- [x] 5.1 Обновить компонентные тесты `packages/ui` под новые компоненты/токены; `npm test` проходит
- [x] 5.2 Обновить браузерные тесты темы (`tests/e2e/theme.spec.ts`) при необходимости; `npm run test:e2e` проходит
- [x] 5.3 Пере-эталонировать скриншоты `tests/e2e/visual.spec.ts-snapshots/` под новую палитру; визуальная регрессия проходит

## 6. Документация и проверки

- [x] 6.1 Обновить `_docs/structure.md` (дизайн-система: shadcn-svelte/Bits UI, стандартные токены) и `AGENTS.md` при необходимости
- [x] 6.2 Записать решение в «Журнал решений» `ROADMAP.md` и дополнить протокол в `_docs/history/`
- [x] 6.3 Прогнать `make verify` и убедиться, что всё проходит без ошибок и предупреждений
