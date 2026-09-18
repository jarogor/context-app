#!/usr/bin/env bash
# Сборка всех WASM-плагинов из workspace src-wasm-plugins/ и развёртывание
# артефактов в ресурсы приложения.
#
# Требования: установленная цель wasm32-unknown-unknown
#   rustup target add wasm32-unknown-unknown
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WORKSPACE_DIR="$ROOT/src-wasm-plugins"
RESOURCES_DIR="$ROOT/src-tauri/resources/plugins"
WASM_DIR="$WORKSPACE_DIR/target/wasm32-unknown-unknown/release"

cd "$WORKSPACE_DIR"
cargo build --release --target wasm32-unknown-unknown

# Развёртывание одного плагина: копирование WASM-модуля и запись манифеста.
deploy_plugin() {
  local name="$1"
  local kind="$2"
  local description="$3"
  local module="$4"
  local export_fn="$5"
  local host_functions_json="$6"
  local provides_json="${7:-[]}"
  local out_dir="$RESOURCES_DIR/$name"

  mkdir -p "$out_dir"
  cp "$WASM_DIR/$module" "$out_dir/$module"

  cat > "$out_dir/plugin-manifest.json" <<JSON
{
  "contract_version": 1,
  "kind": "$kind",
  "name": "$name",
  "description": "$description",
  "module": "$module",
  "export": "$export_fn",
  "host_functions": $host_functions_json,
  "provides": $provides_json,
  "requires": []
}
JSON
  echo "собран плагин: $out_dir"
}

deploy_plugin "demo" "extension" "Демонстрационный плагин: приветствие при старте приложения через host-функцию log" "demo.wasm" "invoke" '["log"]'
deploy_plugin "library" "source" "Базовый плагин создания/открытия библиотеки: чтение структуры, содержимого и служебного состояния через host-функции" "library.wasm" "invoke" '["fs_list_dir", "fs_read_bytes", "open_file", "state_read", "state_write", "state_delete"]' '["library.catalog@1", "library.files@1"]'
