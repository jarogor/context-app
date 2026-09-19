#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLUGIN_DIR="$ROOT/plugins/library-ui"
PUBLIC_DIR="$ROOT/public/plugins/library-ui"

if [ ! -d "$PLUGIN_DIR/node_modules" ]; then
  npm --prefix "$PLUGIN_DIR" install --no-package-lock
fi
npm --prefix "$PLUGIN_DIR" run check
npm --prefix "$PLUGIN_DIR" run build
rm -rf "$PUBLIC_DIR"
mkdir -p "$ROOT/public/plugins"
cp -R "$PLUGIN_DIR/dist" "$PUBLIC_DIR"
