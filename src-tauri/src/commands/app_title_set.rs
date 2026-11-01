//! Заголовок главного окна приложения.

use tauri::WebviewWindow;

/// Установка заголовка окна на выбранном языке интерфейса.
///
/// Имя приложения — такой же текст интерфейса, как и остальные: в русском это
/// «Контекст», в английском — «Context». Ядро не хранит перевод, а принимает
/// готовое имя от оболочки, которая знает активный язык.
#[tauri::command]
pub async fn app_title_set(window: WebviewWindow, title: String) -> Result<(), String> {
    window.set_title(&title).map_err(|error| error.to_string())
}
