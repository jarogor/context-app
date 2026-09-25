#!/usr/bin/env bash
# Сборка автономных frontend-плагинов (npm workspaces) и копирование артефактов
# в public/plugins/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Однократная установка зависимостей всего workspace.
if [ ! -d "$ROOT/node_modules" ]; then
  npm install
fi

# Сборка одного frontend-плагина по имени каталога в plugins/.
build_plugin() {
  local name="$1"
  local plugin_dir="$ROOT/plugins/$name"
  local public_dir="$ROOT/public/plugins/$name"
  local package
  package="$(node -p "require('$plugin_dir/package.json').name")"

  npm run check -w "$package"
  npm run build -w "$package"
  rm -rf "$public_dir"
  mkdir -p "$ROOT/public/plugins"
  cp -R "$plugin_dir/dist" "$public_dir"
  echo "собран frontend-плагин: $public_dir"
}

build_plugin "library-ui"
build_plugin "notifications-ui"
build_plugin "settings-ui"
build_plugin "plugin-store-ui"
