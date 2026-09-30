//! Объединённое состояние plugin host приложения.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::plugin::{AppPluginHost, PluginKind, PluginRuntime, PluginSession};

/// Настройки ленивого runtime чтения книг рабочим местом.
///
/// Runtime собирает source- и рабочие плагины без привязки к открытой
/// библиотеке: рабочее место открывает книгу по вложению (пути) и не зависит от
/// того, откуда эта книга взялась.
pub struct ReaderConfig {
    /// Директории плагинов в порядке приоритета.
    pub directories: Vec<PathBuf>,
    /// Идентификаторы отключённых плагинов.
    pub disabled: Vec<String>,
    /// Корень служебного хранилища source-плагинов runtime чтения.
    pub storage_root: PathBuf,
    /// Путь к постоянному кэшу компиляции WASM.
    pub cache: Option<PathBuf>,
}

/// Путь и имя файла вложения для подмены песочницы на директорию файла.
///
/// Source-плагин читает файл относительно своего песочного корня. Чтобы не
/// открывать плагину произвольный доступ, корнем становится директория самого
/// файла, а плагин получает имя файла.
fn sandbox_for(path: &str) -> Result<(PathBuf, String), String> {
    let canonical = Path::new(path)
        .canonicalize()
        .map_err(|_| "файл книги недоступен".to_string())?;
    let root = canonical
        .parent()
        .ok_or_else(|| "у файла книги нет директории".to_string())?
        .to_path_buf();
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "некорректное имя файла книги".to_string())?
        .to_string();
    Ok((root, name))
}

/// Состояние приложения: сессия библиотечного plugin-а, app-level runtime и
/// runtime чтения книг по вложению вкладки.
pub struct AppState {
    /// Сессия активного source-плагина библиотеки.
    pub session: PluginSession,
    /// App-level runtime базовых плагинов каркаса.
    pub app_host: AppPluginHost,
    /// Корень служебного состояния приложения.
    pub app_state_root: PathBuf,
    /// Настройки runtime чтения книг.
    reader_config: ReaderConfig,
    /// Runtime чтения книг по вложению, собираемый при первом обращении.
    reader: Option<PluginRuntime>,
    /// Содержимое файлов вложений по пути: ядро не интерпретирует байты.
    workplace_files: HashMap<String, Vec<u8>>,
}

impl AppState {
    /// Создание состояния из готовых составляющих.
    pub fn new(
        session: PluginSession,
        app_host: AppPluginHost,
        app_state_root: PathBuf,
        reader_config: ReaderConfig,
    ) -> Self {
        Self {
            session,
            app_host,
            app_state_root,
            reader_config,
            reader: None,
            workplace_files: HashMap::new(),
        }
    }

    /// Корень служебного состояния приложения.
    pub fn app_state_root(&self) -> &Path {
        &self.app_state_root
    }

    /// Runtime чтения книг по вложению.
    ///
    /// Собирается лениво при первом обращении: до открытия книги рабочего места
    /// компилятор WASM не загружается синхронно на старте приложения.
    pub fn reader(&mut self) -> Result<&mut PluginRuntime, String> {
        if self.reader.is_none() {
            let kinds = [PluginKind::Source, PluginKind::Workplace];
            let mut runtime = PluginRuntime::load_filtered(
                &self.reader_config.directories,
                self.reader_config.storage_root.clone(),
                Some(&kinds),
                &self.reader_config.disabled,
                self.reader_config.cache.as_deref(),
            )
            .map_err(|error| error.to_string())?;
            runtime.set_storage_root(self.reader_config.storage_root.clone());
            self.reader = Some(runtime);
        }
        self.reader
            .as_mut()
            .ok_or_else(|| "runtime чтения недоступен".to_string())
    }

    /// Включение песочницы на директорию файла вложения.
    fn apply_sandbox(runtime: &mut PluginRuntime, path: &str) -> Result<String, String> {
        let (root, name) = sandbox_for(path)?;
        runtime.set_sandbox_root(root);
        Ok(name)
    }

    /// Содержимое книги по пути через source-плагин.
    ///
    /// Перебирает source-плагины runtime чтения и возвращает первый успешный
    /// ответ операции `content`. Ядро не интерпретирует результат: разбор
    /// формата выполняет плагин, а приложение получает opaque-модель.
    pub fn reader_content(&mut self, path: &str) -> Result<serde_json::Value, String> {
        let runtime = self.reader()?;
        let name = Self::apply_sandbox(runtime, path)?;
        let ids = runtime.source_plugin_ids();
        let mut last = "нет source-плагина для чтения книги".to_string();
        for id in ids {
            match runtime.invoke_operation(&id, "content", serde_json::json!({ "path": name })) {
                Ok(output) => {
                    return serde_json::from_str(&output).map_err(|error| error.to_string());
                }
                Err(error) => last = error.to_string(),
            }
        }
        Err(last)
    }

    /// Открытие файла книги системным приложением по пути.
    pub fn reader_open_external(&mut self, path: &str) -> Result<(), String> {
        let runtime = self.reader()?;
        let name = Self::apply_sandbox(runtime, path)?;
        let ids = runtime.source_plugin_ids();
        let mut last = "нет source-плагина для открытия книги".to_string();
        for id in ids {
            match runtime.invoke_operation(
                &id,
                "open_external",
                serde_json::json!({ "path": name }),
            ) {
                Ok(_) => return Ok(()),
                Err(error) => last = error.to_string(),
            }
        }
        Err(last)
    }

    /// Содержимое файла вложения по пути.
    ///
    /// Файл читается напрямую, без песочницы библиотеки: рабочее место не знает,
    /// откуда книга. Байты кэшируются; ядро их не интерпретирует.
    pub fn workplace_file(&mut self, path: &str) -> Result<&[u8], String> {
        if !self.workplace_files.contains_key(path) {
            let bytes = std::fs::read(path).map_err(|_| "файл книги не читается".to_string())?;
            self.workplace_files.insert(path.to_string(), bytes);
        }
        self.workplace_files
            .get(path)
            .map(Vec::as_slice)
            .ok_or_else(|| "содержимое книги недоступно".to_string())
    }

    /// Забывание кэша содержимого файла вложения.
    pub fn forget_workplace_file(&mut self, path: &str) {
        self.workplace_files.remove(path);
    }

    /// Порция содержимого файла вложения в base64 по пути.
    ///
    /// Содержимое передаётся частями, чтобы интерфейс не получал весь файл
    /// одним сообщением. Ядро не интерпретирует байты.
    pub fn workplace_chunk(
        &mut self,
        path: &str,
        offset: usize,
        length: usize,
    ) -> Result<serde_json::Value, String> {
        let total = self.workplace_file(path)?.len();
        let bytes = self
            .workplace_files
            .get(path)
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
