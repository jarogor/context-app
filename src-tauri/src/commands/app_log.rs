//! Запись события интерфейса в журнал диагностики.
//!
//! Отдельной ленты уведомлений в приложении нет: сообщение, которое раньше
//! показывалось пользователю плашкой, теперь пишется в тот же файловый журнал,
//! что и техническая диагностика. Отчёт поддержки собирается из него целиком,
//! поэтому событие не теряется.

use crate::plugin::{diagnostics, Severity};

/// Запись события из интерфейса в журнал диагностики.
///
/// Команда асинхронная: запись идёт на диск, и короткая задержка не должна
/// задерживать отклик интерфейса. Неизвестная степень серьёзности трактуется
/// как информационная.
#[tauri::command]
pub async fn app_log(
    severity: String,
    message: String,
    source: String,
    details: Option<serde_json::Value>,
) -> Result<(), String> {
    let severity = Severity::parse(&severity).unwrap_or_default();
    let details = details.unwrap_or_else(|| serde_json::json!({}));
    diagnostics::record(severity, &message, &source, &details);
    Ok(())
}
