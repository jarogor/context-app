//! Объединённое состояние plugin host приложения.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::plugin::{AppPluginHost, PluginSession};

/// Состояние приложения: сессия библиотечного plugin-а и app-level runtime.
pub struct AppState {
    /// Сессия активного source-плагина библиотеки.
    pub session: PluginSession,
    /// App-level runtime базовых плагинов каркаса.
    pub app_host: AppPluginHost,
    /// Корень служебного состояния приложения.
    pub app_state_root: PathBuf,
    /// Содержимое книг, открытых плагином рабочего места, по непрозрачной ссылке.
    workplace_files: HashMap<String, Vec<u8>>,
}

impl AppState {
    /// Создание состояния из готовых составляющих.
    pub fn new(session: PluginSession, app_host: AppPluginHost, app_state_root: PathBuf) -> Self {
        Self {
            session,
            app_host,
            app_state_root,
            workplace_files: HashMap::new(),
        }
    }

    /// Корень служебного состояния приложения.
    pub fn app_state_root(&self) -> &Path {
        &self.app_state_root
    }

    /// Содержимое книги по непрозрачной ссылке.
    ///
    /// При первом обращении запрашивает сырой файл у активного source-плагина
    /// операцией `file_bytes` и кэширует его. Ядро не разбирает содержимое.
    pub fn workplace_file(&mut self, book_id: &str) -> Result<&[u8], String> {
        if !self.workplace_files.contains_key(book_id) {
            let output = self
                .session
                .invoke("file_bytes", serde_json::json!({ "book_id": book_id }))
                .map_err(|error| error.to_string())?;
            let value: serde_json::Value =
                serde_json::from_str(&output).map_err(|error| error.to_string())?;
            let data = value
                .get("data")
                .and_then(|value| value.as_str())
                .ok_or_else(|| "source-плагин не вернул содержимое книги".to_string())?;
            let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, data)
                .map_err(|error| error.to_string())?;
            self.workplace_files.insert(book_id.to_string(), bytes);
        }
        self.workplace_files
            .get(book_id)
            .map(Vec::as_slice)
            .ok_or_else(|| "содержимое книги недоступно".to_string())
    }

    /// Порция содержимого книги в base64 по непрозрачной ссылке.
    ///
    /// Содержимое передаётся частями, чтобы интерфейс не получал весь файл
    /// одним сообщением. Ядро не интерпретирует байты.
    pub fn workplace_chunk(
        &mut self,
        book_id: &str,
        offset: usize,
        length: usize,
    ) -> Result<serde_json::Value, String> {
        let total = self.workplace_file(book_id)?.len();
        let bytes = self
            .workplace_files
            .get(book_id)
            .ok_or_else(|| "содержимое книги недоступно".to_string())?;
        let start = offset.min(total);
        let end = start.saturating_add(length).min(total);
        let encoded = base64::Engine::encode(
            &base64::engine::general_purpose::STANDARD,
            &bytes[start..end],
        );
        Ok(serde_json::json!({
            "chunk": encoded,
            "offset": start,
            "next": end,
            "total": total,
            "done": end >= total,
        }))
    }
}
