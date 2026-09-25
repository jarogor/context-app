## Why

Фундамент плагинной подсистемы почти закрыт, но плагины можно добавить только
вручную, копируя папки; нет единицы поставки плагина и нет установки/удаления из
приложения. Чтобы Ф0 роадмапа («файловый стор плагинов») считалась закрытой и
чтобы позже подключить сетевые каталоги, нужен файловый стор: установка из
zip-пакета и контракт поставщика стора.

## What Changes

- Ввести формат пакета плагина: zip-архив с `plugin-manifest.json` и модулем
  (плюс, в перспективе, прочими файлами); безопасная распаковка без выхода за
  пределы каталога установки.
- Ввести пользовательский каталог плагинов приложения (в разработке
  `dev_data/app-plugins`, в проде — app data dir), общий для всех библиотек;
  сессия загружает из него `source`/`extension`-плагины.
- Добавить привилегированные host-функции ядра `store_inspect`, `store_install`,
  `store_uninstall`, `store_installed`, доступные только плагину-стору.
- Ввести базовый WASM-плагин `plugin-store` (capability `plugin-store@1`):
  установка из файла, удаление, список установленных, реестр сторов
  (`stores_list`/`stores_add`/`stores_remove`) с провайдерами `file` и `network`.
- Ввести контракт поставщика стора и формат индекса пакетов; **заглушка**
  сетевого провайдера возвращает «не поддерживается», не выходя в сеть.
- Ввести frontend-плагин `plugin-store-ui`: кнопка и страница стора
  (установленные плагины, установка из файла, удаление, список сторов).
- Добавить регион `store` в оболочку по образцу региона `settings`.
- Зафиксировать в `ROADMAP.md` будущий этап: подпись пакетов и проверка
  целостности/доверия.

## Capabilities

### New Capabilities

- `plugin-store`: формат пакета плагина, установка из файла, удаление, список
  установленных, реестр сторов и контракт поставщика с файловым провайдером и
  заглушкой сетевого, UI стора.

### Modified Capabilities

- `plugin-system`: загрузка плагинов из пользовательского каталога приложения и
  привилегированные host-функции установки/удаления пакетов.
- `app-shell`: регион стора (кнопка в верхней панели и страница) по образцу
  региона настроек.

## Impact

- Rust-ядро: `constants.rs`, `lib.rs`, `plugin/contract.rs`, `plugin/runtime.rs`,
  `plugin/session.rs`, `plugin/app_host.rs`, `plugin/plugin_manifest.rs`.
- WASM: новый workspace-плагин `src-wasm-plugins/plugin-store/`.
- Frontend: новый плагин `plugins/plugin-store-ui/`; регион в `src/App.svelte`.
- Сборка и ресурсы: `src-wasm-plugins/Cargo.toml`, `scripts/build-wasm-plugins.sh`,
  `scripts/build-frontend-plugins.sh`, `src-tauri/resources/base-plugins/plugin-store/`.
- Документация: `_docs/plugin-contract.md`, `_docs/structure.md`, `_docs/README.md`,
  `ROADMAP.md`.
- OpenSpec-спеки: `plugin-store` (новая), `plugin-system`, `app-shell`.
