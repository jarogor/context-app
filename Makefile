# Единая точка входа для сборки и проверок «Текстуры».
#
# Артефакты плагинов генерируются из исходников в `src-wasm-plugins/` и в git
# не хранятся. Все команды, которым нужны плагины, сами собирают артефакты,
# поэтому «забыл пересобрать» невозможно: и dev-запуск, и проверки идут через
# этот файл.

SHELL := /bin/bash
.DEFAULT_GOAL := help

.PHONY: help plugins artifacts check-artifacts dev dev-test build release run-release \
        check test test-rust e2e rust-check verify clean

help: ## Показать список команд
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

plugins: ## Собрать WASM-плагины и разложить артефакты в ресурсы
	bash scripts/build-wasm-plugins.sh

artifacts: ## Разложить артефакты из уже собранных WASM (без Cargo)
	node scripts/plugin-artifacts.mjs build

check-artifacts: ## Проверить, что артефакты плагинов актуальны
	node scripts/plugin-artifacts.mjs check

dev: ## Запустить desktop-приложение (сборка плагинов — в beforeDevCommand)
	npm run tauri dev

dev-test: ## Поднять Vite с мок-мостом Tauri (для UI без десктопа)
	npm run dev:test

build: ## Полная сборка приложения
	npm run build

release: ## Release-сборка desktop-приложения (с плагинами)
	npm run tauri build

run-release: ## Собрать release без упаковки и запустить бинарь
	npm run tauri build -- --no-bundle
	./src-tauri/target/release/jarogor-texture

check: ## Проверки фронтенда: типы и форматирование
	npm run check
	npm run check:ts

test: ## Модульные и компонентные тесты (Rust + фронтенд)
	cargo test --manifest-path src-tauri/Cargo.toml
	cargo test --manifest-path src-wasm-plugins/Cargo.toml
	cargo test --manifest-path src-wasm-sdk/Cargo.toml
	npm test

e2e: ## Браузерные тесты Playwright
	npm run test:e2e

rust-check: ## Clippy без предупреждений и проверка форматирования Rust
	cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
	cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
	cargo clippy --manifest-path src-wasm-plugins/Cargo.toml --target wasm32-unknown-unknown --all-targets -- -D warnings
	cargo fmt --manifest-path src-wasm-plugins/Cargo.toml --all -- --check
	cargo clippy --manifest-path src-wasm-sdk/Cargo.toml --all-targets -- -D warnings
	cargo clippy --manifest-path src-wasm-sdk/Cargo.toml --target wasm32-unknown-unknown --all-targets -- -D warnings
	cargo fmt --manifest-path src-wasm-sdk/Cargo.toml --all -- --check

verify: ## Полный набор проверок перед завершением задачи
	$(MAKE) plugins
	$(MAKE) check-artifacts
	$(MAKE) test
	$(MAKE) rust-check
	$(MAKE) check
	$(MAKE) e2e
	$(MAKE) build

clean: ## Удалить сгенерированные артефакты (ресурсы плагинов)
	rm -rf src-tauri/resources/plugins src-tauri/resources/base-plugins
