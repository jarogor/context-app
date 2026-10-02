#!/usr/bin/env bash
# Сборка всех WASM-плагинов из workspace src-wasm-plugins/.
#
# Скрипт только собирает WASM-модули. Раскладку артефактов по ресурсам
# выполняет `scripts/plugin-artifacts.mjs` (единый источник — манифесты в
# исходниках плагинов), поэтому список плагинов здесь не дублируется.
#
# Требования: установленная цель wasm32-unknown-unknown
#   rustup target add wasm32-unknown-unknown
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "$ROOT/src-wasm-plugins"
cargo build --release --target wasm32-unknown-unknown

cd "$ROOT"
node scripts/plugin-artifacts.mjs build
