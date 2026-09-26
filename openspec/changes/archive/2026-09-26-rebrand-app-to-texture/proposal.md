## Why

Приложение называется «Jarogor BookLib»/«BookLib», но продукт переименовывается
в «Текстура». Сейчас имя рассыпано по UI, конфигурации Tauri, имени crate и
npm-пакетам, тестам и документации; без единого прохода они разойдутся, а старый
бренд останется в артефактах и идентификаторах.

## What Changes

- Пользовательское имя приложения становится «Текстура»: надпись в верхней панели
  оболочки, заголовок окна, `<title>` документа, приветственное уведомление при
  старте.
- **BREAKING**: bundle identifier меняется с `com.jarogor.booklib` на
  `ru.jarogor.texture`. Приложение начинает использовать новый каталог данных;
  содержимое старого каталога автоматически не переносится (принято сознательно —
  миграция данных не входит в изменение).
- Технические имена приводятся к латинскому «Texture»: имя Cargo-пакета и
  библиотеки (`jarogor-texture` / `jarogor_texture_lib`), корневой npm-пакет
  (`jarogor-texture`), имена npm-пакетов frontend-плагинов
  (`jarogor-texture-*-ui`), npm-scope `@booklib/*` → `@texture/*`.
- `description` пакетов и `//!`-комментарии WASM-плагинов обновляются на
  «Текстура».
- Обновляются e2e-тесты, эталонный скриншот оболочки, `README.md`, `ROADMAP.md` и
  локальная техсправка `_docs/`.
- Устаревший служебный маркер `.booklib` в `.gitignore` заменяется на `.texture`.

## Capabilities

### New Capabilities

Нет.

### Modified Capabilities

- `app-shell`: добавляется требование о названии приложения — верхняя панель
  каркаса и заголовок окна отображают «Текстура».
- `notifications`: пример служебного файла `.booklib` в требовании о шумных
  событиях заменяется на `.texture`; нормативное поведение не меняется.

## Impact

- Конфигурация Tauri: `src-tauri/tauri.conf.json` (`productName`, `identifier`,
  `title`), `src-tauri/capabilities/default.json` (description).
- Frontend/каркас: `index.html`, `src/App.svelte`, `src/app.css`,
  `src/lib/app-bridge.ts`, `src/lib/PluginFrame.svelte` (канал `texture-plugin`),
  `vite.config.ts`, `packages/*`, `plugins/*`.
- Rust-ядро: `src-tauri/Cargo.toml`, `src-tauri/src/main.rs`,
  `src-tauri/src/lib.rs` (текст приветствия и demo-вызова), `Cargo.lock`.
- WASM-плагины: `src-wasm-plugins/*/Cargo.toml` и `src/lib.rs` (описания и
  doc-комментарии).
- Тесты: `tests/e2e/shell.spec.ts`, `tests/e2e/visual.spec.ts` и эталон
  `tests/e2e/visual.spec.ts-snapshots/shell-chromium-linux.png`.
- Документация: `README.md`, `ROADMAP.md`, `AGENTS.md`, `_docs/*`, `.gitignore`.
- Совместимость: смена bundle identifier меняет каталог данных приложения;
  старые пользовательские данные остаются в прежнем каталоге и не подхватываются.
- Вне области: переименование dev-данных в `dev_data/`, содержимого
  `openspec/changes/archive/`, сгенерированных артефактов (`dist/`,
  `public/plugins/`, `src-tauri/target/`) — они пересобираются или остаются
  историческими.
