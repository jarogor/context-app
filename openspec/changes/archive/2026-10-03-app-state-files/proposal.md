## Why

Служебные конфиги и кеши приложения нигде не описаны как единое целое.
`plugin-manifest.json` упоминается в `plugin-system` и `plugin-store`, но
расположение и формат остальных файлов (`app-config.json`, `app-state/*.json`,
`base-plugins/*.json`, кэш компиляции) в спеках не зафиксированы. Из-за этого
возникает вопрос: почему везде JSON, а `wasm-cache.toml` — TOML.

Разбор показал: `wasm-cache.toml` читает wasmtime (через Extism), и его формат
менять нельзя — `CacheConfig::from_file` разбирает именно TOML. Значит, вопрос не
в конвертации, а в отсутствии спецификации. Нужна спека, которая перечисляет
служебные файлы, их расположение, формат и причину исключения.

## What Changes

- Заводится спека `app-state`: реестр служебных файлов состояния и кэшей, единый
  формат JSON для реестров, явное исключение TOML для `wasm-cache.toml` с
  обоснованием, состояние базовых плагинов и SQLite-индекс плагинов.
- Спека `plugin-system` дополняется требованием о служебном состоянии плагина по
  ключу (JSON, атомарная запись, безопасный ключ, разделение хранилищ).
- Форматы существующих файлов не меняются: изменение только фиксирует текущее
  поведение.

## Capabilities

### New Capabilities

- `app-state`: служебные конфиги и кеши приложения — расположение, форматы,
  правила совместимости.

### Modified Capabilities

- `plugin-system`: добавляется требование о служебном состоянии плагина по ключу
  (`state_read`/`state_write`/`state_delete`).

## Impact

- Спеки: `openspec/specs/app-state/spec.md` (новая), требование в
  `openspec/specs/plugin-system/spec.md`.
- Документация: ссылка и краткий разбор «JSON против TOML» в `_docs/structure.md`.
- Код не меняется; поведение уже реализовано (`constants.rs`, `workspace_state.rs`,
  `library_history.rs`, `plugin/activation.rs`, `plugin/wasm_cache.rs`,
  `src-wasm-plugins/*/src/lib.rs`).
