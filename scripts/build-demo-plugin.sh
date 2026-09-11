#!/usr/bin/env bash
# Сборка demo-плагина и копирование артефакта в ресурсы приложения.
#
# Требования: установленная цель wasm32-unknown-unknown
#   rustup target add wasm32-unknown-unknown
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/src-tauri/demo-plugin"
OUT_DIR="$ROOT/src-tauri/resources/plugins/demo-plugin"

cd "$PLUGIN_DIR"
cargo build --release --target wasm32-unknown-unknown

mkdir -p "$OUT_DIR"
cp target/wasm32-unknown-unknown/release/demo_plugin.wasm "$OUT_DIR/demo_plugin.wasm"

cat > "$OUT_DIR/plugin-manifest.json" <<'JSON'
{
  "contract_version": 1,
  "name": "demo-plugin",
  "description": "Демонстрационный плагин: приветствие при старте приложения через host-функцию log",
  "module": "demo_plugin.wasm",
  "export": "invoke",
  "host_functions": ["log"]
}
JSON

echo "demo-plugin собран: $OUT_DIR"