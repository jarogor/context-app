## 1. Начальная загрузка состояния

- [x] 1.1 Ввести `src/lib/bootstrap.ts`: параллельная загрузка реестра (`get_workspaces`) и активной библиотеки (`active_library`), с необязательностью библиотеки и пробросом ошибки реестра
- [x] 1.2 Покрыть `bootstrap.ts` модульными тестами (успех, отсутствие библиотеки, ошибка реестра)

## 2. Корневой компонент и фазы

- [x] 2.1 Ввести `src/Root.svelte` с фазами `boot → ready | error`; монтировать `App` только в фазе `ready`
- [x] 2.2 Ввести экраны `BootstrapLoading.svelte` (спиннер) и `BootstrapError.svelte` (сообщение, «данные не потеряны», «Повторить»); повтор перезапускает загрузку
- [x] 2.3 Переключить `src/main.ts` на монтирование `Root.svelte`

## 3. Оболочка принимает начальное состояние

- [x] 3.1 `App.svelte`: принять `initialRegistry` и `initialLibrary`, инициализировать состояние через `untrack`; убрать «догоняющую» загрузку реестра и флаг `registryLoaded`
- [x] 3.2 Убрать промежуточный индикатор загрузки из `WorkplaceSurface.svelte` и `WorkspacesPage.svelte` (проп `registryLoading`/`loading`)

## 4. Тесты

- [x] 4.1 Обновить `tests/e2e/workspaces.spec.ts`: загрузка до готовности, ошибка загрузки, повтор после ошибки, пустой список
- [x] 4.2 Прогнать `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`

## 5. Документация

- [x] 5.1 Обновить `ROADMAP.md` (журнал решений), `_docs/history/` и профильную техсправку; синхронизировать спеки `app-shell` и `workspace-manager`
