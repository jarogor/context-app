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
BASE_RESOURCES_DIR="$ROOT/src-tauri/resources/base-plugins"
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
  local settings_json="${8:-}"
  local base_dir="$RESOURCES_DIR"
  if [ "$kind" = "base" ]; then
    base_dir="$BASE_RESOURCES_DIR"
  fi
  local out_dir="$base_dir/$name"

  local settings_field=""
  if [ -n "$settings_json" ]; then
    settings_field=",
  \"settings\": $settings_json"
  fi

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
  "requires": []$settings_field
}
JSON
  echo "собран плагин: $out_dir"
}

deploy_plugin "notifications" "base" "Базовый плагин уведомлений и технических логов" "notifications.wasm" "invoke" '["state_read", "state_write", "emit_event", "now_millis"]' '["notifications.journal@1"]' '{
    "title": "Уведомления",
    "sections": [
      {
        "id": "notifications",
        "title": "Журнал",
        "description": "Параметры журнала уведомлений",
        "fields": [
          {
            "key": "technical_visible_default",
            "title": "Показывать технические уведомления",
            "type": "boolean",
            "description": "Включать технический уровень при открытии журнала",
            "default": false
          }
        ]
      }
    ]
  }'
deploy_plugin "settings" "base" "Базовый плагин настроек приложения и плагинов" "settings.wasm" "invoke" '["state_read", "state_write", "emit_event"]' '["settings.store@1"]'
deploy_plugin "plugin-store" "base" "Базовый плагин файлового стора плагинов" "plugin_store.wasm" "invoke" '["state_read", "state_write", "emit_event", "import_read_bytes", "store_inspect", "store_install", "store_uninstall", "store_installed"]' '["plugin-store@1"]'
deploy_plugin "demo" "extension" "Демонстрационный плагин: приветствие при старте приложения через host-функцию log" "demo.wasm" "invoke" '["log"]'
deploy_plugin "library" "source" "Плагин каталога, импорта и чтения библиотеки" "library.wasm" "invoke" '["fs_list_dir", "fs_read_bytes", "fs_write_bytes", "open_file", "import_read_bytes", "state_read", "state_write", "state_delete", "notify"]' '["library.catalog@1", "library.files@1"]'
