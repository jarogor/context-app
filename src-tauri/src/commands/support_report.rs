//! Отчёт о работе приложения: версия, система, плагины и журнал в одном файле.
//!
//! Пользователь не эксперт: он не знает, что смотреть и что присылать, и
//! обычно просто говорит «не работает». Поэтому приложение само собирает
//! отчёт — версию, систему, плагины и журнал диагностики — и сохраняет его
//! одним текстовым файлом, который достаточно приложить к обращению.

use std::sync::Mutex;

use tauri::State;
use tauri_plugin_dialog::DialogExt;

use crate::plugin::AppState;

/// Собранный отчёт: имя файла и содержимое.
#[derive(serde::Serialize, serde::Deserialize)]
pub struct SupportReport {
    /// Предлагаемое имя файла с датой.
    pub file_name: String,
    /// Текст отчёта.
    pub content: String,
}

/// Сборка отчёта о работе приложения.
///
/// Команда асинхронная: она ждёт общий `Mutex<AppState>` и читает файлы.
#[tauri::command]
pub async fn support_report(state: State<'_, Mutex<AppState>>) -> Result<SupportReport, String> {
    let mut state = crate::commands::lock_state(state.inner())?;
    Ok(state.support_report())
}

/// Имя файла отчёта с датой и временем.
pub fn report_file_name() -> String {
    format!(
        "context-report-{}.txt",
        crate::plugin::diagnostics::file_stamp()
    )
}

/// Сохранение отчёта в выбранный пользователем файл.
///
/// Диалог выбора места показывает сама система: пользователю не нужно знать,
/// куда приложение пишет по умолчанию. Возвращается путь, если файл записан.
#[tauri::command]
pub async fn support_report_save(
    app: tauri::AppHandle,
    report: SupportReport,
) -> Result<Option<String>, String> {
    let path = app
        .dialog()
        .file()
        .set_title("Сохранить отчёт")
        .set_file_name(&report.file_name)
        .add_filter("Текстовый файл", &["txt", "log"])
        .blocking_save_file();
    let Some(path) = path else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("некорректный путь сохранения: {error}"))?;
    std::fs::write(&path, report.content)
        .map_err(|error| format!("не удалось записать отчёт: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
