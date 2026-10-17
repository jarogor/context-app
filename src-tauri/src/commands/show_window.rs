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

/// Фон окна под **выбранную пользователем** тему оформления приложения.
///
/// Тема приложения независима от темы ОС: пользователь может держать светлое
/// оформление при тёмной системе. Фон окна должен совпадать с экраном загрузки,
/// который интерфейс уже отрисовал по выбранной теме, иначе при показе окна
/// мелькала бы чужая сторона темы. `system` и отсутствие значения дают `None` —
/// тогда фон берётся по теме ОС.
fn background_for_preference(preference: Option<&str>) -> Option<Color> {
    match preference {
        Some("dark") => Some(Color(0x28, 0x28, 0x28, 0xff)),
        Some("light") => Some(Color(0xfb, 0xf1, 0xc7, 0xff)),
        _ => None,
    }
}

/// Показ окна после того, как интерфейс отрисовал экран загрузки.
///
/// Окно создаётся скрытым, чтобы белый кадр webview не успел показаться.
/// Команда асинхронная: обращение к окну не должно блокировать главный поток.
/// `theme` — выбранная тема оформления приложения (`light`/`dark`); её интерфейс
/// уже применил на статичном экране, поэтому фон окна подстраивается под неё, а
/// не под тему ОС, и показ окна не «переключает» сторону темы.
#[tauri::command]
pub async fn show_window(window: WebviewWindow, theme: Option<String>) -> Result<(), String> {
    crate::startup::mark("показано окно (первый кадр)");
    let color = background_for_preference(theme.as_deref())
        .unwrap_or_else(|| background_for(window.theme().unwrap_or(Theme::Light)));
    let _ = window.set_background_color(Some(color));
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
