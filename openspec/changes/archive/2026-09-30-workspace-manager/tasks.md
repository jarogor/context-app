## 1. Ядро: реестр рабочих мест

- [x] 1.1 Заменить одиночную модель `WorkspaceState` на реестр: `WorkspaceRecord` (`id`, `name`, `created_at_millis`, `tabs`, `active_tab_id`) и `WorkspacesFile` (`workspaces`, `active_workspace_id`) в `src-tauri/src/workspace_state.rs`; атомарная запись `workspaces.json`; Rust-тесты round-trip и отсутствующего файла в `workspace_state_tests.rs` — проверка `cargo test`
- [x] 1.2 Реализовать однократный перенос прежнего `workspace.json` в рабочее место по умолчанию с детерминированным идентификатором и именем «Рабочее место» при первом чтении реестра; Rust-тесты на перенос вкладок и на отсутствие дублирования при повторном чтении — проверка `cargo test`
- [x] 1.3 Заменить команды `get_workspace`/`save_workspace` на `get_workspaces`/`save_workspaces` (`commands/get_workspaces.rs`, `commands/save_workspaces.rs`), обновить `commands/mod.rs` и `lib.rs`, удалить прежние команды — проверка `cargo test` и `cargo clippy --all-targets -- -D warnings`

## 2. Модель и сохранение в оболочке

- [x] 2.1 Создать `src/lib/workspace-registry.ts`: типы реестра и рабочего места, `emptyRegistry`, `normalizeRegistry`, операции `createWorkspace`, `renameWorkspace`, `removeWorkspace`, `selectWorkspace`, `renameTab`-независимые хелперы вкладок; покрыть модульным тестом `workspace-registry.test.ts` — проверка `npm test`
- [x] 2.2 Перевести `src/lib/workplace.ts` на работу с вкладками выбранного рабочего места (операции принимают/возвращают реестр либо его запись); обновить `workplace.test.ts` — проверка `npm test`
- [x] 2.3 В `src/App.svelte` перейти на загрузку и дебаунс-сохранение реестра через `get_workspaces`/`save_workspaces`, ввести активное рабочее место и направлять `workspace:open-book` в него с созданием рабочего места по умолчанию при отсутствии; обновить обработчики вкладок — проверка существующих e2e-сценариев рабочего места

## 3. Экран списка рабочих мест

- [x] 3.1 Создать `src/lib/WorkspacesPage.svelte`: список рабочих мест с именем и отметкой активного, создание с вводом имени, открытие, переименование, удаление и пустое состояние с подсказкой; покрыть компонентным тестом `WorkspacesPage.test.ts` — проверка `npm test`
- [x] 3.2 Дополнить область рабочего места переключением «список ↔ вкладки»: показывать `WorkspacesPage` при отсутствии активного рабочего места, а при активном — вкладки с именем рабочего места и возвратом к списку (`WorkplaceArea.svelte`, `WorkplaceTabs.svelte`); покрыть компонентным тестом — проверка `npm test`

## 4. Старт и шапка оболочки

- [x] 4.1 Открывать при запуске область рабочего места (`workspaceOpen` по умолчанию) и вести кнопку-иконку рабочего места в список или вкладки активного рабочего места; привести вывод заголовка раздела в соответствие; обновить обработку выбора раздела — проверка e2e-сценариев оболочки

## 5. Тесты и фикстуры

- [x] 5.1 Обновить `packages/testing/src/fixtures.ts`: моки `get_workspaces`/`save_workspaces` с реестром, содержащим рабочее место и вкладки; убрать моки прежних команд — проверка `npm test` и `npm run test:e2e`
- [x] 5.2 Добавить e2e-сценарии реестра: создание рабочего места, переключение между рабочими местами с разными вкладками, переименование, удаление, перенос прежнего состояния; обновить затронутые `shell.spec.ts`, `workplace-tabs.spec.ts`, `workplace-persist.spec.ts` — проверка `npm run test:e2e`

## 6. Документация и проверки

- [x] 6.1 Обновить статус домена в `ROADMAP.md` и локальную техсправку `_docs/` (устройство реестра и экран списка) — проверка сверки текста с реализацией
- [x] 6.2 Полный набор проверок: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`
