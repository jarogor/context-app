## 1. Перенос исходников в `src-wasm-plugins/` и workspace

- [x] 1.1 Создать виртуальный Cargo workspace `src-wasm-plugins/Cargo.toml` (`members = ["demo", "library"]`, `resolver = "2"`) и `git mv src-tauri/demo-plugin` → `src-wasm-plugins/demo`; проверить, что `git status` показывает перенос без потери истории и `cargo metadata --manifest-path src-wasm-plugins/Cargo.toml` видит оба workspace-члена
- [x] 1.2 Переименовать пакет demo-плагина: `demo_plugin` → `demo` (папка, `[package] name`, `[lib] path`, doc-комментарии), `crate-type` → `["cdylib", "rlib"]`; проверить отсутствие упоминаний `demo_plugin` в `src-wasm-plugins/demo/` (`grep -rn demo_plugin src-wasm-plugins`)
- [x] 1.3 Переименовать пакет library-плагина: `library_plugin` → `library`, `crate-type` оставить `["cdylib", "rlib"]`; проверить, что `grep -rn library_plugin src-wasm-plugins/library` не даёт совпадений, а описание/манифест пакета обновлены
- [x] 1.4 Решить судьбу двух `Cargo.lock` (общий workspace-lock `src-wasm-plugins/Cargo.lock` вместо прежних) и собрать оба плагина одной командой: `cargo build --release --target wasm32-unknown-unknown --manifest-path src-wasm-plugins/Cargo.toml` → проверить, что в `src-wasm-plugins/target/wasm32-unknown-unknown/release/` появились `demo.wasm` и `library.wasm`

## 2. Скрипт сборки и артефакты

- [x] 2.1 Создать единый `scripts/build-wasm-plugins.sh` (сборка workspace из 1.4, копирование `<name>.wasm` и запись `plugin-manifest.json` в `src-tauri/resources/plugins/<name>/`); проверить запуск скрипта: артефакты `src-tauri/resources/plugins/demo/{demo.wasm,plugin-manifest.json}`
- [x] 2.2 Обновить манифесты: demo — `name: "demo"`, `module: "demo.wasm"` (описание и host-функции без изменений), library — `module: "library.wasm"`; проверить `jq`/чтением `plugin-manifest.json` в `resources/plugins/{demo,library}/`
- [x] 2.3 Удалить `scripts/build-demo-plugin.sh` и `scripts/build-library-plugin.sh` (только после явного согласия пользователя) и проверить, что ссылок на них больше нет: `git grep -n build-demo-plugin\|build-library-plugin`

## 3. Ядро: runtime-имя demo-плагина

- [x] 3.1 В `src-tauri/src/constants.rs` переименовать `DEMO_PLUGIN_DIR = "demo-plugin"` → `DEMO_PLUGIN_NAME = "demo"` с уточнённым doc-комментарием; обновить импорт и использования в `src-tauri/src/lib.rs` (проверка наличия и `invoke` demo-плагина); проверить `cargo build --manifest-path src-tauri/Cargo.toml` и отсутствие `demo-plugin` в `src-tauri/src/` кроме исторических комментариев
- [x] 3.2 Проверить, что `library_plugin_available()`/`library_plugin`-логика тестов (`src-tauri/src/library/_tests.rs`, `plugin_manifest_tests.rs`, `runtime_tests.rs`) не зависит от переименований (`LIBRARY_PLUGIN_DIR = "library"` и `resources/plugins/library/` не меняются); `cargo test --manifest-path src-tauri/Cargo.toml` проходит

## 4. Документация и конвенции

- [x] 4.1 Обновить `_docs/structure.md`, `_docs/plugin-contract.md`, `_docs/run.md` и `AGENTS.md` (раздел «Плагинная архитектура»): `src-wasm-plugins/{demo,library}/`, единый скрипт `scripts/build-wasm-plugins.sh`, артефакты `resources/plugins/{demo,library}/`; проверить `git grep -n "src-tauri/demo-plugin\|src-tauri/library-plugin\|build-demo-plugin\|build-library-plugin"` — остаются только осмысленные упоминания прошлой структуры
- [x] 4.2 Прогнать `scripts/build-wasm-plugins.sh` и убедиться, что `_docs/run.md`-сценарий (загрузка demo-плагина, имя в журнале) описан под новое имя `demo`; сверить `git status` на предмет незакоммиченных артефактов

## 5. Финальные проверки

- [x] 5.1 `cargo test --manifest-path src-tauri/Cargo.toml` — все тесты проходят (62, включая тесты внешней библиотеки с реальным source-плагином из `resources/plugins/library/`)
- [x] 5.2 `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings` и `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` — без предупреждений и расхождений форматирования
- [x] 5.3 `cargo test --manifest-path src-wasm-plugins/Cargo.toml` — нативные тесты library-плагина (мок `Fs`) проходят; `cargo fmt`/style плагинов согласован с `rustfmt.toml` репозитория (добавлен `src-wasm-plugins/rustfmt.toml`); при проверке найдены и исправлены латентные баги: тесты использовали `.txt` (входит в `BOOK_FORMATS`) вместо не-книжного расширения `.md`, удалён мёртвый метод `read_text` тестового мока `NativeFs`
- [x] 5.4 `npm run check` (0 errors, 0 warnings), `npm run build` (dist готов), `openspec validate --all` (8/8 passed)