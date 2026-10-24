//! Открытие внешней ссылки книги системным приложением.

/// Открытие внешней ссылки книги в системном браузере.
///
/// Ссылки книги не навигируют документ чтения: книга живёт в изолированной
/// области, и переход по ссылке уводил бы её с содержимого. Разрешены только
/// безопасные схемы — `http`, `https` и `mailto`; остальные отклоняются, чтобы
/// через книгу нельзя было запустить локальную программу или файл.
#[tauri::command]
pub fn reader_open_link(href: String) -> Result<(), String> {
    let lower = href.trim().to_ascii_lowercase();
    let safe = lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:");
    if !safe {
        return Err("ссылка не поддерживается".to_string());
    }
    open::that(href.trim()).map_err(|_| "не удалось открыть ссылку".to_string())
}
