//! Фоновая компиляция runtime чтения на старте приложения.
//!
//! source- и рабочие плагины компилируются в фоне параллельно с загрузкой окна
//! и заполняют постоянный кэш, поэтому первое открытие библиотеки не ждёт
//! первичной JIT-компиляции. Тот же runtime переиспользуется чтением книг: одна
//! компиляция на набор, без конкурирующих загрузок за CPU.

use std::sync::Arc;

use super::app_state::ReaderConfig;
use super::{get_bus, PluginRuntime, PluginScope, Severity, SharedRuntime};

/// Запуск фоновой сборки runtime чтения и возврат её дескриптора.
///
/// Компиляция выполняется в отдельном потоке; её результат — готовый runtime,
/// разделяемый с командами чтения. Ошибки публикуются как техническая
/// диагностика и не прерывают старт приложения.
pub(crate) fn spawn_reader_warmup(config: ReaderConfig) -> Arc<SharedRuntime<PluginRuntime>> {
    SharedRuntime::spawn(move || {
        let scopes = [PluginScope::Session, PluginScope::Book];
        let mut runtime = PluginRuntime::load_filtered(
            &config.directories,
            config.storage_root.clone(),
            Some(&scopes),
            &config.disabled,
            config.cache.as_deref(),
        )
        .map_err(|error| {
            let message = error.to_string();
            get_bus().publish_technical(
                Severity::Debug,
                format!("Прогрев плагинов чтения не удался: {message}"),
                "core",
                serde_json::json!({}),
            );
            message
        })?;
        runtime.set_storage_root(config.storage_root.clone());
        crate::startup::mark("фон: runtime чтения собран");
        get_bus().publish_technical(
            Severity::Debug,
            format!(
                "Прогрев плагинов чтения завершён: {}",
                runtime.plugin_names().len()
            ),
            "core",
            serde_json::json!({}),
        );
        Ok(runtime)
    })
}

#[cfg(test)]
#[path = "warmup_tests.rs"]
mod tests;
