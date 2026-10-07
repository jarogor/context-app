//! WASM-точка входа source-плагина Calibre.
//!
//! Модуль собирается только под целевую архитектуру `wasm32`: разбирает запрос
//! по контракту и делегирует действия обработчикам [`handlers`].

use extism_pdk::{plugin_fn, FnResult};
use source_common::request::Request;

#[path = "handlers.rs"]
mod handlers;

/// Ответ операции открытия source-сессии.
#[derive(serde::Serialize)]
pub(crate) struct OpenResponse {
    /// Идентификатор source-сессии.
    pub(crate) session_id: String,
    /// Согласованный snapshot каталога.
    pub(crate) catalog: crate::models::SourceCatalog,
}

/// Точка расширения: диспетчеризация действий плагина.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
    let request: Request = serde_json::from_str(&input)?;
    let response = match request.action.as_str() {
        "capabilities" => handlers::capabilities(),
        "probe" => handlers::probe(),
        "open" => handlers::open(&request),
        "catalog" | "list" => handlers::catalog(&request),
        "search" => handlers::search(&request),
        "read" => handlers::read(&request),
        "cover" => handlers::cover(&request),
        "open_external" => handlers::open_external(&request),
        "sync" => handlers::sync(&request),
        other => Err(format!("неизвестное действие плагина: {other}")),
    };
    Ok(response.map_err(extism_pdk::Error::msg)?)
}
