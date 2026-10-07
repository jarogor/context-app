//! Объединённое состояние plugin host приложения.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::plugin::{AppInfo, AppPluginHost, PluginKind, PluginRuntime, PluginSession, Severity};

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

/// Настройки ленивой сборки app-level runtime базовых плагинов.
///
/// Тяжёлая загрузка и компиляция WASM не выполняется на старте окна: они
/// откладываются до первого обращения к runtime, чтобы появление окна не ждало
/// компилятор плагинов.
pub struct AppHostConfig {
    /// Директории базовых плагинов в порядке приоритета.
    pub directories: Vec<PathBuf>,
    /// Корень служебного хранилища базовых плагинов.
    pub storage_root: PathBuf,
    /// Пользовательский каталог плагинов для стора.
    pub user_plugins_dir: PathBuf,
    /// Корень состояния активности плагинов.
    pub activation_root: PathBuf,
    /// Каталоги session-плагинов, видимые базовым плагинам.
    pub catalog_dirs: Vec<PathBuf>,
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
    /// Корень служебного состояния приложения.
    pub app_state_root: PathBuf,
    /// Сведения о приложении для страницы «Информация».
    app_info: AppInfo,
    /// Настройки runtime чтения книг.
    reader_config: ReaderConfig,
    /// Runtime чтения книг по вложению, собираемый при первом обращении.
    reader: Option<PluginRuntime>,
    /// Настройки сборки runtime базовых плагинов.
    app_host_config: AppHostConfig,
    /// App-level runtime базовых плагинов, собираемый при первом обращении.
    ///
    /// Намеренно ленивый: компиляция WASM базовых плагинов не должна задерживать
    /// появление окна приложения.
    app_host: Option<AppPluginHost>,
    /// Содержимое файлов вложений по пути: ядро не интерпретирует байты.
    workplace_files: HashMap<String, Vec<u8>>,
}

impl AppState {
    /// Создание состояния из готовых составляющих.
    ///
    /// Runtime базовых плагинов не собирается: для него сохраняются настройки, а
    /// сама сборка откладывается до первого обращения к `app_host`.
    pub fn new(
        session: PluginSession,
        app_state_root: PathBuf,
        app_info: AppInfo,
        reader_config: ReaderConfig,
        app_host_config: AppHostConfig,
    ) -> Self {
        Self {
            session,
            app_state_root,
            app_info,
            reader_config,
            reader: None,
            app_host_config,
            app_host: None,
            workplace_files: HashMap::new(),
        }
    }

    /// Runtime базовых плагинов каркаса.
    ///
    /// Собирается лениво при первом обращении: загрузка и компиляция WASM
    /// базовых плагинов, регистрация настроек, сброс журнала, порог логирования
    /// и приветственное уведомление выполняются уже после появления окна.
    pub fn app_host(&mut self) -> Result<&mut AppPluginHost, String> {
        if self.app_host.is_none() {
            let config = &self.app_host_config;
            let mut host = AppPluginHost::load_with_cache(
                &config.directories,
                config.storage_root.clone(),
                config.cache.as_deref(),
            )
            .map_err(|error| error.to_string())?;
            host.set_plugin_store_root(config.user_plugins_dir.clone());
            host.set_activation_root(config.activation_root.clone());
            host.set_catalog_dirs(config.catalog_dirs.clone());
            let _ = host.reset_notifications();
            let _ = host.refresh_settings_registry(&[]);
            host.refresh_log_level();
            if host.welcome_notification_enabled() {
                host.notify_user(
                    Severity::Info,
                    "Добро пожаловать в «Текстуру»",
                    "app",
                    serde_json::json!({}),
                );
            }
            self.app_host = Some(host);
        }
        self.app_host
            .as_mut()
            .ok_or_else(|| "runtime базовых плагинов недоступен".to_string())
    }

    /// Сведения о приложении для страницы «Информация».
    pub fn app_info(&self) -> AppInfo {
        self.app_info.clone()
    }

    /// Корень служебного состояния приложения.
    pub fn app_state_root(&self) -> &Path {
        &self.app_state_root
    }

    /// Идентификаторы отключённых плагинов из реестра активности.
    pub fn disabled_plugins(&self) -> Vec<String> {
        crate::plugin::activation::load(&self.app_state_root).unwrap_or_default()
    }

    /// Перечитывание реестра настроек сессии и уведомление стора.
    ///
    /// Вызывается после перезагрузки состава плагинов сессии: декларации
    /// настроек активных плагинов передаются базовому плагину настроек, а стор
    /// получает событие об изменении применённого состояния.
    pub fn after_session_reload(&mut self) {
        let sources = self.session.settings_sources();
        if let Ok(host) = self.app_host() {
            let _ = host.refresh_settings_registry(&sources);
        }
        crate::plugin::relay::emit(
            "plugin-store:changed",
            serde_json::json!({ "reason": "session" }),
        );
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

    /// Каталог модуля рисования плагина рабочего места.
    ///
    /// Ядро не интерпретирует содержимое: каталог нужен лишь для безопасного
    /// перечисления и чтения файлов модуля по идентификатору плагина.
    pub fn viewer_dir(&mut self, plugin_id: &str) -> Result<PathBuf, String> {
        self.reader()?
            .viewer_dir(plugin_id)
            .ok_or_else(|| format!("модуль рисования плагина не найден: {plugin_id}"))
    }

    /// Список файлов модуля рисования плагина (относительные пути и MIME).
    pub fn viewer_files(&mut self, plugin_id: &str) -> Result<serde_json::Value, String> {
        let dir = self.viewer_dir(plugin_id)?;
        let files = crate::plugin::viewer::list_files(&dir).map_err(|error| error.to_string())?;
        serde_json::to_value(files).map_err(|error| error.to_string())
    }

    /// Содержимое файла модуля рисования в base64.
    ///
    /// Путь читается только внутри каталога модуля; содержимое не
    /// интерпретируется и передаётся интерфейсу непрозрачно.
    pub fn viewer_file(
        &mut self,
        plugin_id: &str,
        path: &str,
    ) -> Result<serde_json::Value, String> {
        let dir = self.viewer_dir(plugin_id)?;
        let bytes =
            crate::plugin::viewer::read_file(&dir, path).map_err(|error| error.to_string())?;
        let encoded = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
        Ok(serde_json::json!({
            "path": path,
            "data": encoded,
        }))
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
        match self.workplace_files.entry(path.to_string()) {
            Entry::Occupied(entry) => Ok(entry.into_mut().as_slice()),
            Entry::Vacant(entry) => {
                let bytes =
                    std::fs::read(path).map_err(|_| "файл книги не читается".to_string())?;
                Ok(entry.insert(bytes).as_slice())
            }
        }
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
        let bytes = self.workplace_file(path)?;
        let total = bytes.len();
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

#[cfg(test)]
#[path = "app_state_tests.rs"]
mod tests;
