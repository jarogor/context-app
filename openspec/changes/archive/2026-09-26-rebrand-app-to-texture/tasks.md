## 1. Конфигурация и пользовательские поверхности

- [x] 1.1 В `src-tauri/tauri.conf.json` сменить `productName` на `Texture`, `identifier` на `ru.jarogor.texture`, `app.windows[0].title` на «Текстура»; проверить, что JSON валиден и поля заданы.
- [x] 1.2 В `index.html` заменить `<title>Jarogor BookLib</title>` на «Текстура»; проверить через `grep`/`npm run build`, что в сборке остаётся новое название.
- [x] 1.3 В `src/App.svelte` заменить надпись `BookLib` в верхней панели на «Текстура»; проверить, что e2e-тест шапки (задача 4.1) находит новый текст.
- [x] 1.4 В `src-tauri/src/lib.rs` заменить текст приветствия и значение в demo-вызове (`{"title":...}`) на «Текстура»; проверить, что приветственное уведомление содержит новое название.
- [x] 1.5 В `.gitignore` заменить устаревший маркер `.booklib` на `.texture`; проверить, что он покрывает служебный каталог.

## 2. Rust-ядро и WASM-плагины

- [x] 2.1 В `src-tauri/Cargo.toml` переименовать `name` в `jarogor-texture`, `[lib] name` в `jarogor_texture_lib`, обновить `description`; проверить, что `cargo build` обновляет `src-tauri/Cargo.lock` без ошибок.
- [x] 2.2 В `src-tauri/src/main.rs` заменить вызов `jarogor_booklib_lib::run()` на `jarogor_texture_lib::run()`; проверить успешной компиляцией `cargo check`.
- [x] 2.3 Обновить `description` и `//!`-комментарии во всех WASM-плагинах (`src-wasm-plugins/{library,library-calibre,settings,notifications,plugin-store,demo}/`): «Jarogor BookLib» → «Текстура»; проверить `cargo test --manifest-path src-tauri/Cargo.toml` и сборку плагинов `scripts/build-wasm-plugins.sh` без предупреждений.
- [x] 2.4 Обновить комментарий бренда в `packages/ui/src/tokens.css` на «Текстура»; проверить, что стили не затронуты (`npm run build`).

## 3. Frontend-пакеты и npm-scope

- [x] 3.1 Переименовать имена и зависимости workspace-пакетов `@booklib/*` → `@texture/*` в `packages/{ui,ui-schema,testing}/package.json`; проверить, что `npm install` завершается без ошибок.
- [x] 3.2 Переименовать npm-пакеты frontend-плагинов (`jarogor-booklib-*-ui[-plugin]` → `jarogor-texture-...`) в `plugins/*/package.json`; проверить `npm install`.
- [x] 3.3 Обновить все импорты и ссылки `@booklib/ui`, `@booklib/ui-schema`, `@booklib/testing`, `@booklib/ui/tokens.css` в `src/`, `plugins/`, `packages/`, `vite.config.ts` и `plugins/*/vite.config.ts`; проверить, что в исходниках не осталось `@booklib` и `npm run check` проходит.
- [x] 3.4 Обновить `name`, `devDependencies`, `dependencies` в корневом `package.json` (`jarogor-booklib` → `jarogor-texture`); пересобрать `package-lock.json` через `npm install`; проверить успешную установку.
- [x] 3.5 Проверить `npm run build`, что приложение и frontend-плагины собираются с новыми именами.

## 4. Тесты

- [x] 4.1 Обновить ожидаемый текст в `tests/e2e/shell.spec.ts` и `tests/e2e/visual.spec.ts` с «BookLib» на «Текстура»; проверить, что оба теста находят новый текст.
- [x] 4.2 Перегенерировать эталон `tests/e2e/visual.spec.ts-snapshots/shell-chromium-linux.png` (изменилась надпись в шапке); проверить стабильность повторным прогоном.
- [x] 4.3 Прогнать `npm test` и `npm run test:e2e`; проверить, что все тесты зелёные без обновления эталона.

## 5. Документация

- [x] 5.1 Обновить заголовок и упоминания в `README.md` на «Текстура».
- [x] 5.2 Обновить заголовок и упоминания в `ROADMAP.md` (включая «Журнал решений» при необходимости зафиксировать решение о ребрендинге и смене identifier).
- [x] 5.3 Обновить заголовок `AGENTS.md` (`jarogor_booklib` → новое имя).
- [x] 5.4 Обновить `_docs/*` (`README.md`, `structure.md`, `plugin-contract.md`, `run.md`, `library-index.md`) на «Текстура»/`Texture`, привести устаревшие упоминания в соответствие с кодом.

## 6. Финальная верификация

- [x] 6.1 Выполнить поиск остатков старого бренда (`BookLib`, `booklib`, `Jarogor`) по исходникам/конфигам/документации; убедиться, что остались только архивные материалы, `dev_data/` и сгенерированные артефакты.
- [x] 6.2 Выполнить полный набор проверок из `AGENTS.md`: `scripts/build-wasm-plugins.sh`, `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`, `npm run check`, `npm test`, `npm run test:e2e`, `npm run build`; убедиться в отсутствии ошибок и предупреждений.
- [x] 6.3 Выполнить `openspec validate --all` и убедиться, что изменение и дельта-спеки валидны.

## 7. Дополнительные остатки бренда

- [x] 7.1 Переименовать внутренний канал `booklib-plugin` → `texture-plugin` в `src/lib/PluginFrame.svelte` и `plugins/*/src/bridge.ts` (+ `NotificationsPlugin.svelte`, `StorePlugin.svelte`); проверить сборку и e2e.
- [x] 7.2 Обновить `description` в `src-tauri/capabilities/default.json` («Default capabilities for Texture»); проверить перегенерацию `src-tauri/gen/schemas/capabilities.json`.
- [x] 7.3 Обновить тестовую фикстуру `json!("BookLib")` → `json!("Текстура")` в `src-wasm-plugins/settings/src/store_tests.rs`; проверить `cargo test`.
- [x] 7.4 Обновить пример `.booklib` → `.texture` в спеке `notifications` через дельта-спеку; проверить `openspec validate --all`.
