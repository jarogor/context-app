//! Фоновый прогрев компиляции WASM-модулей source-плагинов.
//!
//! При старте приложения прогревает bundled source-плагины, чтобы их первичная
//! JIT-компиляция не попадала на первое открытие библиотеки: скомпилированные
//! модули ложатся в постоянный кэш, и открытие сразу показывает прогресс
//! индексации без заметной паузы.

use std::path::PathBuf;

use super::{get_bus, PluginKind, PluginRuntime, Severity};

/// Запуск фонового прогрева source-плагинов из указанных директорий.
///
/// Компиляция выполняется в отдельном потоке; её единственный результат —
/// заполнение дискового кэша, поэтому runtime сразу освобождается. Ошибки
/// публикуются как техническая диагностика и не прерывают старт приложения.
pub(crate) fn spawn_source_warmup(directories: Vec<PathBuf>, cache_config: Option<PathBuf>) {
    std::thread::spawn(move || {
        let kinds = [PluginKind::Source];
        let result = PluginRuntime::load_kinds(
            &directories,
            PathBuf::from("."),
            Some(&kinds),
            cache_config.as_deref(),
        );
        match result {
            Ok(runtime) => {
                get_bus().publish_technical(
                    Severity::Debug,
                    format!(
                        "Прогрев source-плагинов завершён: {}",
                        runtime.plugin_names().len()
                    ),
                    "core",
                    serde_json::json!({}),
                );
            }
            Err(error) => {
                get_bus().publish_technical(
                    Severity::Debug,
                    format!("Прогрев source-плагинов не удался: {error}"),
                    "core",
                    serde_json::json!({}),
                );
            }
        }
    });
}
