//! Показ окна приложения после первой отрисовки экрана загрузки.

use tauri::window::Color;
use tauri::{Theme, WebviewWindow};

/// Фон окна под активную тему ОС.
///
/// Окно создаётся скрытым, поэтому его фон виден лишь мгновение — между
/// появлением и первой отрисовкой webview. Тёмный фон не даёт белой вспышке
/// появиться на тёмной теме ОС.
fn background_for(theme: Theme) -> Color {
    match theme {
        Theme::Dark => Color(0x28, 0x28, 0x28, 0xff),
        _ => Color(0xfb, 0xf1, 0xc7, 0xff),
    }
}

/// Показ окна после того, как интерфейс отрисовал экран загрузки.
///
/// Окно создаётся скрытым, чтобы белый кадр webview не успел показаться.
/// Команда асинхронная: обращение к окну не должно блокировать главный поток.
#[tauri::command]
pub async fn show_window(window: WebviewWindow) -> Result<(), String> {
    let theme = window.theme().unwrap_or(Theme::Light);
    let _ = window.set_background_color(Some(background_for(theme)));
    window.show().map_err(|error| error.to_string())
}

/// Страховочный показ окна, если интерфейс не показал его сам.
///
/// Интерфейс может не загрузиться (ошибка скриптов, сбой сборки) — тогда окно
/// осталось бы скрытым навсегда. Фоновый показ через небольшую задержку
/// гарантирует, что окно появится; повторный показ безвреден.
pub fn schedule_fallback_show(window: WebviewWindow) {
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(5));
        if matches!(window.is_visible(), Ok(false)) {
            let theme = window.theme().unwrap_or(Theme::Light);
            let _ = window.set_background_color(Some(background_for(theme)));
            let _ = window.show();
        }
    });
}
