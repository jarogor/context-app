//! Плагин формата чтения FB2.
//!
//! Плагин отвечает за формат целиком: читает файл книги через host-функцию и
//! разбирает его в главы. Отрисовку делает модуль рисования (`viewer/`), а
//! оболочка управляет чтением, заметками и свойствами файла — плагин формата
//! об этом не знает.
//!
//! Собранный модуль экспортирует только `invoke` по контракту приложения и
//! вызывает host-функции `fs_read_bytes` (чтение файла) и `now_millis`.

pub mod fb2;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde_json::json;

/// Глава книги в модели содержимого.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chapter {
    /// Заголовок главы, если он найден при разборе.
    pub title: Option<String>,
    /// Внутренний HTML главы с изображениями в `data:`-URI.
    pub html: String,
}

/// Обработка действия плагина.
///
/// `content` получает путь к файлу и байты (читает их `wasm.rs`) и отдаёт
/// содержимое книги; прочие действия считаются неизвестными.
pub fn handle(action: &str, path: &str, bytes: &[u8]) -> Result<String, String> {
    match action {
        "content" => content(path, bytes),
        other => Err(format!("неизвестное действие плагина формата: {other}")),
    }
}

/// Разбор книги в содержимое: название, авторы и главы.
fn content(path: &str, bytes: &[u8]) -> Result<String, String> {
    let format = std::path::Path::new(path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if format != "fb2" {
        return Err(format!("плагин FB2 не читает формат: {format}"));
    }
    let metadata = fb2::extract(bytes);
    let chapters = fb2::chapters(bytes)?;
    if chapters.is_empty() {
        return Err("в FB2 нет читаемых глав".to_string());
    }
    serde_json::to_string(&json!({
        "title": metadata.title,
        "authors": metadata.authors,
        "chapters": chapters,
    }))
    .map_err(|error| error.to_string())
}
