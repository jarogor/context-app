//! Общие текстовые ярлыки и сообщения source-плагинов.

/// Название и путь библиотеки из payload открытия.
pub fn library_label(payload: &serde_json::Value) -> (String, String) {
    let path = payload
        .get("path")
        .and_then(|value| value.as_str())
        .unwrap_or_default()
        .to_string();
    let name = std::path::Path::new(&path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path.as_str())
        .to_string();
    (name, path)
}

/// Сообщение об индексации с названием и путём библиотеки.
pub fn indexed_message(base: &str, name: &str, path: &str) -> String {
    if path.is_empty() {
        base.to_string()
    } else {
        format!("{base}: {name} ({path})")
    }
}
