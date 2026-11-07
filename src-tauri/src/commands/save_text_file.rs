//! Сохранение готового текста в файл, выбранный пользователем.
//!
//! Ядро не знает, что за текст оно записывает: содержимое и имя файла готовит
//! владелец данных (например, базовый плагин), а команда лишь показывает
//! системный диалог сохранения и пишет файл. Так ядро остаётся свободным от
//! предметных форматов.

use tauri_plugin_dialog::DialogExt;

/// Имя файла по умолчанию, если владелец данных его не задал.
const DEFAULT_FILE_NAME: &str = "export.txt";

/// Сохранение текста в выбранный пользователем файл.
///
/// Возвращается путь записанного файла; `None` — пользователь отменил выбор.
#[tauri::command]
pub async fn save_text_file(
    app: tauri::AppHandle,
    file_name: String,
    content: String,
) -> Result<Option<String>, String> {
    let name = file_name.trim();
    let name = if name.is_empty() {
        DEFAULT_FILE_NAME
    } else {
        name
    };
    let Some(path) = app.dialog().file().set_file_name(name).blocking_save_file() else {
        return Ok(None);
    };
    let path = path
        .into_path()
        .map_err(|error| format!("некорректный путь сохранения: {error}"))?;
    std::fs::write(&path, content).map_err(|error| format!("не удалось записать файл: {error}"))?;
    Ok(Some(path.to_string_lossy().into_owned()))
}
