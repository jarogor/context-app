//! Трассировка вызовов плагинов.
//!
//! Публикует в bus техническое событие о каждом вызове: операцию, длительность,
//! усечённый запрос и ответ, а при ошибке — дополнительное событие со степенью
//! `error`.

use crate::plugin::{get_bus, PluginError, Severity};

/// Лимит длины поля трассировочного события в байтах.
const TRACE_FIELD_LIMIT: usize = 2048;

/// Публикация трассировочного события вызова плагина.
///
/// Payload и результат усекаются до лимита, чтобы не раздувать журнал.
/// Ошибка вызова дополнительно публикуется со степенью `error`.
pub(super) fn trace_call(
    name: &str,
    operation: &str,
    request: &str,
    result: &Result<String, PluginError>,
    elapsed: std::time::Duration,
) {
    // Payload трассировки строится только если порог логирования допускает
    // степень `Trace`: иначе усечение строк и сборка JSON выполнялись бы зря.
    if Severity::Trace.allows(crate::plugin::bus::log_level()) {
        let mut details = serde_json::json!({
            "plugin": name,
            "operation": operation,
            "duration_ms": elapsed.as_millis() as u64,
            "ok": result.is_ok(),
            "request": truncate(request, TRACE_FIELD_LIMIT),
        });
        match result {
            Ok(response) => {
                details["response"] =
                    serde_json::Value::String(truncate(response, TRACE_FIELD_LIMIT));
            }
            Err(error) => {
                details["error"] = serde_json::Value::String(error.to_string());
            }
        }
        get_bus().publish(
            Severity::Trace,
            format!("Вызов {operation}: {name}"),
            "core",
            details,
        );
    }
    if let Err(error) = result {
        get_bus().publish(
            Severity::Error,
            format!("Вызов {operation} завершился ошибкой: {name}"),
            "core",
            serde_json::json!({
                "plugin": name,
                "operation": operation,
                "error": error.to_string(),
            }),
        );
    }
}

/// Усечение строки до лимита по границе символа.
fn truncate(value: &str, limit: usize) -> String {
    if value.len() <= limit {
        return value.to_string();
    }
    let mut end = limit;
    while end > 0 && !value.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &value[..end])
}
