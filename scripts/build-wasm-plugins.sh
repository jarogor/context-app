#!/usr/bin/env bash
# Сборка всех WASM-плагинов из workspace src-wasm-plugins/.
#
# Скрипт только собирает WASM-модули. Раскладку артефактов по ресурсам
# выполняет `scripts/plugin-artifacts.mjs` (единый источник — манифесты в
# исходниках плагинов), поэтому список плагинов здесь не дублируется.
#
# Плагины зависят от SDK каркаса (`src-wasm-sdk/`) путями: SDK — отдельный
# workspace, который Cargo собирает как path-зависимости плагинов, поэтому
# отдельная сборка SDK здесь не нужна.
#
# Требования: установленная цель wasm32-unknown-unknown
#   rustup target add wasm32-unknown-unknown
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/src-wasm-plugins"
cargo build --release --target wasm32-unknown-unknown

cd "$ROOT"
# Модуль рисования плагина формата чтения — самостоятельный фронтенд-проект
# внутри каталога плагина: собирается в статические файлы `viewer/` до раскладки
# артефактов (они в git не хранятся).
npm run build -w format-pdf-viewer

node scripts/plugin-artifacts.mjs build
