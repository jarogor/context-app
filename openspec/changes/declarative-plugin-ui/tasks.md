## 1. Модель и контракт UI

- [ ] 1.1 Зафиксировать в `packages/ui-schema` схему декларативного UI: версия, узлы, пространства, событие → идентификатор действия; покрыть типами и проверить `npm run check`
- [ ] 1.2 Определить и описать в спеках/design первый набор пространств интерфейса и минимальный набор разрешённых компонентов и свойств; подтвердить `openspec validate declarative-plugin-ui`

## 2. Отказ от автономных frontend-плагинов

- [ ] 2.1 Перенести UI уведомлений (`plugins/notifications-ui`) в приложение как встроенную поверхность; обновить `openspec/specs/notifications` и тесты
- [ ] 2.2 Перенести UI настроек (`plugins/settings-ui`) в приложение; обновить `openspec/specs/settings` и тесты
- [ ] 2.3 Перенести UI стора плагинов (`plugins/plugin-store-ui`) в приложение; обновить `openspec/specs/plugin-store` и тесты
- [ ] 2.4 Перенести UI библиотеки (`plugins/library-ui`) в приложение; обновить `openspec/specs/library-ui` и тесты
- [ ] 2.5 Удалить автономные плагины и инфраструктуру: `plugins/*`, `src/lib/PluginFrame.svelte`, `scripts/build-frontend-plugins.sh`, `public/plugins/`, workspaces и `kind: "ui"`; обновить `package.json`, `AGENTS.md`, `README.md`, `_docs/*`; проверить `npm run build`

## 3. Протокол декларативного UI

- [ ] 3.1 Ввести хост-команды для интентов: приём действия `{space, action, values}` и возврат обновлённой декларации; обновить `packages/testing` фикстуры
- [ ] 3.2 Реализовать рендерер `ui-schema` в оболочке: узлы → компоненты и токены `@texture/ui`, обработка неизвестных узлов; компонентные тесты
- [ ] 3.3 Реализовать реестр пространств и каталог разрешённых элементов/свойств с диагностикой недопустимого вклада; тесты

## 4. SDK и версионирование

- [ ] 4.1 Ввести SDK для UI-плагинов (Rust PDK) с типизированными компонентами, пространствами и действиями; пример-плагин и тесты
- [ ] 4.2 Обеспечить версионирование схемы UI и контракта с диагностикой несовместимой версии; тесты

## 5. Проверки и документация

- [ ] 5.1 Обновить браузерные сценарии и e2e под встроенные поверхности и декларации; прогнать `npm test`, `npm run test:e2e`
- [ ] 5.2 Полный набор: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`, `openspec validate --all`
