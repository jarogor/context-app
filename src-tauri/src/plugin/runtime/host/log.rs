//! Host-функции журнала и прикладных событий.

use extism::{CurrentPlugin, UserData, Val};

use crate::plugin::{get_bus, Severity};

use super::super::host_state::HostState;

/// Host-функция `log`: публикация технического сообщения плагина в bus.
///
/// Сигнатура: `log(severity, message, details)`.
pub(super) fn host_log(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    _returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let severity_raw: String = plugin.memory_get_val(&args[0])?;
    let message: String = plugin.memory_get_val(&args[1])?;
    let details: String = plugin.memory_get_val(&args[2])?;
    let severity = Severity::parse(&severity_raw).unwrap_or_default();
    get_bus().publish_technical(severity, message, "plugin", parse_details(&details));
    Ok(())
}

/// Host-функция публикации уведомления, сформированного плагином.
///
/// Сигнатура: `notify(level, severity, message, details)`.
pub(super) fn host_notify(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let level: String = plugin.memory_get_val(&args[0])?;
    let severity_raw: String = plugin.memory_get_val(&args[1])?;
    let message: String = plugin.memory_get_val(&args[2])?;
    let details: String = plugin.memory_get_val(&args[3])?;
    let severity = Severity::parse(&severity_raw).unwrap_or_default();
    let details = parse_details(&details);
    if level == "user" {
        get_bus().publish_user(severity, message, "plugin", details);
    } else {
        get_bus().publish_technical(severity, message, "plugin", details);
    }
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Разбор деталей события; некорректный JSON сохраняется как строка.
fn parse_details(details: &str) -> serde_json::Value {
    serde_json::from_str(details).unwrap_or_else(|_| {
        serde_json::json!({
            "raw": details,
        })
    })
}

/// Host-функция `emit_event`: эмиссия именованного прикладного события в Tauri.
///
/// Payload парсится как JSON; при ошибке парсинга передаётся строкой, чтобы
/// плагин не терял событие из-за некорректных данных.
pub(super) fn host_emit_event(
    plugin: &mut CurrentPlugin,
    args: &[Val],
    returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let name: String = plugin.memory_get_val(&args[0])?;
    let payload: String = plugin.memory_get_val(&args[1])?;
    let payload = serde_json::from_str(&payload).unwrap_or(serde_json::Value::String(payload));
    crate::plugin::relay::emit(&name, payload);
    plugin
        .memory_set_val(&mut returns[0], "ok")
        .map_err(|err| extism::Error::msg(err.to_string()))
}

/// Host-функция `now_millis`: текущее время Unix в миллисекундах.
///
/// Плагины не могут использовать системное время внутри `wasm32-unknown-unknown`,
/// поэтому получают его от приложения.
pub(super) fn host_now_millis(
    plugin: &mut CurrentPlugin,
    _args: &[Val],
    returns: &mut [Val],
    _user_data: UserData<HostState>,
) -> Result<(), extism::Error> {
    let millis = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default();
    plugin
        .memory_set_val(&mut returns[0], millis.to_string())
        .map_err(|err| extism::Error::msg(err.to_string()))
}
