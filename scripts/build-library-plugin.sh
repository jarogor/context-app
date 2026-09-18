#!/usr/bin/env bash
# Сборка базового source-плагина библиотеки и копирование артефакта в ресурсы приложения.
#
# Требования: установленная цель wasm32-unknown-unknown
#   rustup target add wasm32-unknown-unknown
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/src-tauri/library-plugin"
OUT_DIR="$ROOT/src-tauri/resources/plugins/library"

cd "$PLUGIN_DIR"
cargo build --release --target wasm32-unknown-unknown

mkdir -p "$OUT_DIR"
cp target/wasm32-unknown-unknown/release/library_plugin.wasm "$OUT_DIR/library_plugin.wasm"

cat > "$OUT_DIR/plugin-manifest.json" <<'JSON'
{
  "contract_version": 2,
  "kind": "source",
  "name": "library",
  "description": "Базовый плагин создания/открытия библиотеки: чтение структуры автор/книга через host-функции файловой системы",
  "module": "library_plugin.wasm",
  "export": "invoke",
  "host_functions": ["fs_list_dir"]
}
JSON

echo "library-plugin собран: $OUT_DIR"