## Why

Исходники WASM-плагинов (`demo-plugin`, `library-plugin`) лежат внутри `src-tauri/`
вперемешку с crate самого приложения, а суффикс `-plugin` в именах компенсирует
отсутствие отдельной директории. С ростом числа плагинов корень Tauri-приложения
засоряется, а связь «исходник → ресурс приложения» становится неочевидной.

## What Changes

- Новая корневая директория `src-wasm-plugins/` за пределами `src-tauri/` — единое
  место для исходников всех WASM-плагинов. Каждый плагин — отдельный подкаталог
  `src-wasm-plugins/<имя>/`.
- Перенос исходников: `src-tauri/demo-plugin/` → `src-wasm-plugins/demo/`,
  `src-tauri/library-plugin/` → `src-wasm-plugins/library/`.
- Убирается суффикс `-plugin`: crate `demo_plugin` → `demo`, `library_plugin` →
  `library`; WASM-модули `demo_plugin.wasm` → `demo.wasm`, `library_plugin.wasm` →
  `library.wasm`; папка ресурсов `resources/plugins/demo-plugin/` →
  `resources/plugins/demo/`. Имя в манифесте demo-плагина `demo-plugin` → `demo`
  (source-плагин уже называется `library`).
- Собранные артефакты (WASM + `plugin-manifest.json`) по-прежнему кладутся в
  `src-tauri/resources/plugins/` — стандартную точку монтирования ресурсов Tauri
  для упаковки; рантайм-резолв пути `bundled_plugins_dir()` не меняется.
- `src-wasm-plugins/` оформляется как Cargo workspace с общим `Cargo.lock` и
  `target/`; скрипты `scripts/build-demo-plugin.sh` и
  `scripts/build-library-plugin.sh` объединяются в один
  `scripts/build-wasm-plugins.sh`, собирающий все плагины разом.
- Обновляются обращения к имени demo-плагина в ядре (`constants.rs`, `lib.rs`),
  `.gitignore` (игнор `src-wasm-plugins/target`) и документация
  (`_docs/structure.md`, `_docs/plugin-contract.md`, `_docs/run.md`).

Проверки: `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy`,
`cargo fmt --check`, `npm run check`, `npm run build`, `openspec validate --all`,
сборка плагинов `scripts/build-wasm-plugins.sh`.

## Capabilities

Рефакторинг не меняет внешнее поведение приложения: загрузка плагинов из папки
`plugins/` библиотеки и поставляемых ресурсов, контракт v2, host-функции и имена
source-плагинов остаются прежними. Поэтому change объявлен с `skip_specs: true`
(изменяется только расположение и именование исходников и скриптов сборки,
спецификационных требований не вводится и не меняется).

### New Capabilities

- (нет — чистый рефакторинг структуры репозитория)

### Modified Capabilities

- (нет — поведение на уровне требований не изменяется)

## Impact

- `src-tauri/demo-plugin/`, `src-tauri/library-plugin/` — переезд в
  `src-wasm-plugins/demo/`, `src-wasm-plugins/library/` с переименованием crate,
  WASM-модуля и манифеста.
- `src-wasm-plugins/Cargo.toml` — новый workspace; `.gitignore` — добавление
  `src-wasm-plugins/target`.
- `scripts/build-demo-plugin.sh`, `scripts/build-library-plugin.sh` — замена одним
  `scripts/build-wasm-plugins.sh` (сборка workspace, копирование артефактов в
  `src-tauri/resources/plugins/{demo,library}/`).
- `src-tauri/resources/plugins/` — переименована папка `demo-plugin/` → `demo/`
  (обновлённый `plugin-manifest.json` и `demo.wasm`); `library/` обновляется
  (`library.wasm`).
- `src-tauri/src/constants.rs` — значение `DEMO_PLUGIN_DIR` `"demo-plugin"` →
  `"demo"`; `src-tauri/src/lib.rs` — проверка существующих библиотек (содержат
  `plugins/demo-plugin/`) не ломается: загрузка по директориям не зависит от
  имён в манифесте, а старый артефакт остаётся совместимым.
- Без изменений: рантайм-подсистема плагинов (`plugin/`), `bundled_plugins_dir()`,
  контракт v2, host-функции, имена source-плагинов, фронтенд и Tauri-команды.
- Документация `_docs/` обновляется под новую структуру.