#!/usr/bin/env bash
# Сборка автономных frontend-плагинов и копирование артефактов в public/.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Сборка одного frontend-плагина: установка зависимостей, проверка и деплой.
build_plugin() {
  local name="$1"
  local plugin_dir="$ROOT/plugins/$name"
  local public_dir="$ROOT/public/plugins/$name"

  if [ ! -d "$plugin_dir/node_modules" ]; then
    npm --prefix "$plugin_dir" install --no-package-lock
  fi
  npm --prefix "$plugin_dir" run check
  npm --prefix "$plugin_dir" run build
  rm -rf "$public_dir"
  mkdir -p "$ROOT/public/plugins"
  cp -R "$plugin_dir/dist" "$public_dir"
  echo "собран frontend-плагин: $public_dir"
}

build_plugin "library-ui"
build_plugin "notifications-ui"
