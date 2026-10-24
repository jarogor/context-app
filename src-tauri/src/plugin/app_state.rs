//! Объединённое состояние plugin host приложения.

use std::collections::hash_map::Entry;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use super::shared_runtime::SharedRuntime;
use crate::plugin::{AppInfo, AppPluginHost, PluginRuntime, PluginScope, PluginSession, Severity};

use super::cover_cache::{CoverCache, CoverData};

/// Настройки ленивого runtime чтения книг рабочим местом.
///
/// Runtime собирает source- и рабочие плагины без привязки к открытой
/// библиотеке: рабочее место открывает книгу по вложению (пути) и не зависит от
/// того, откуда эта книга взялась.
#[derive(Clone)]
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

/// Настройки сборки app-level runtime базовых плагинов.
///
/// Тяжёлая загрузка и компиляция WASM не выполняется на главном потоке: сборка
/// идёт в фоне параллельно с загрузкой окна, а команды ждут готовый результат,
/// не удерживая общий замок состояния приложения.
#[derive(Clone)]
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

impl AppHostConfig {
    /// Сборка полностью инициализированного runtime базовых плагинов.
    ///
    /// Выполняется в фоновом потоке: загрузка и компиляция WASM базовых
    /// плагинов, регистрация настроек, сброс журнала, порог логирования и
    /// приветственное уведомление готовятся до первого обращения команды, но не
    /// задерживают показ окна.
    pub fn build_host(&self) -> Result<AppPluginHost, String> {
        let mut host = AppPluginHost::load_with_cache(
            &self.directories,
            self.storage_root.clone(),
            self.cache.as_deref(),
        )
        .map_err(|error| error.to_string())?;
        host.set_plugin_store_root(self.user_plugins_dir.clone());
        host.set_activation_root(self.activation_root.clone());
        host.set_catalog_dirs(self.catalog_dirs.clone());
        let _ = host.reset_notifications();
        let _ = host.refresh_settings_registry(&[]);
        host.refresh_log_level();
        if host.welcome_notification_enabled() {
            host.notify_user(
                Severity::Info,
                "Добро пожаловать в «Контекст»",
                "app",
                serde_json::json!({}),
            );
        }
        crate::startup::mark("фон: базовые плагины собраны");
        Ok(host)
    }
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
    /// Runtime чтения книг по вложению, собираемый в фоне при первом обращении.
    ///
    /// Разделяется по `Arc`: команда получает дескриптор под коротким общим
    /// замком и ждёт готовности уже на замке самого runtime.
    reader: Option<Arc<SharedRuntime<PluginRuntime>>>,
    /// Настройки сборки runtime базовых плагинов.
    app_host_config: AppHostConfig,
    /// App-level runtime базовых плагинов, собираемый в фоне.
    app_host: Option<Arc<SharedRuntime<AppPluginHost>>>,
    /// Содержимое файлов вложений по пути: ядро не интерпретирует байты.
    workplace_files: HashMap<String, Vec<u8>>,
    /// Дисковый кэш обложек книг по пути.
    ///
    /// Извлечение обложки дорого, а список рабочих мест показывает её сразу,
    /// поэтому результат кэшируется между запусками. `None` — кэш ещё не
    /// прочитан с диска.
    cover_cache: Option<CoverCache>,
}

impl AppState {
    /// Создание состояния из готовых составляющих.
    ///
    /// Runtime базовых плагинов не собирается синхронно: для него сохраняются
    /// настройки, а фоновая сборка запускается отдельно (`spawn_app_host`), чтобы
    /// не задерживать появление окна.
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
            cover_cache: None,
        }
    }

    /// Запуск фоновой сборки runtime базовых плагинов.
    ///
    /// Вызывается при старте приложения: компиляция базовых плагинов идёт
    /// параллельно с загрузкой webview. Повторный вызов переиспользует уже
    /// начатую сборку.
    pub fn spawn_app_host(&mut self) -> Arc<SharedRuntime<AppPluginHost>> {
        if let Some(existing) = &self.app_host {
            return Arc::clone(existing);
        }
        let config = self.app_host_config.clone();
        let shared = SharedRuntime::spawn(move || config.build_host());
        self.app_host = Some(Arc::clone(&shared));
        shared
    }

    /// Дескриптор runtime базовых плагинов для ожидания готовности.
    ///
    /// Если фоновая сборка ещё не запускалась, она запускается здесь. Команда
    /// получает дескриптор под коротким общим замком и отпускает его, а ждёт
    /// готовности уже на замке самого runtime.
    pub fn app_host_handle(&mut self) -> Arc<SharedRuntime<AppPluginHost>> {
        self.spawn_app_host()
    }

    /// Ожидание готовности runtime базовых плагинов и выполнение действия.
    ///
    /// Внутренний доступ к runtime под уже удержанным общим замком. Готовый
    /// результат фоновой сборки ожидается на замке самого runtime.
    pub fn with_app_host<R>(
        &mut self,
        action: impl FnOnce(&mut AppPluginHost) -> R,
    ) -> Result<R, String> {
        self.spawn_app_host();
        let shared = self
            .app_host
            .as_ref()
            .expect("фоновая сборка app-level runtime запущена");
        shared.with_ready(action)
    }

    /// Дескриптор runtime чтения для ожидания готовности.
    ///
    /// Сборка запускается в фоне при первом обращении, а ожидание переносится на
    /// замок самого runtime.
    pub fn reader_handle(&mut self) -> Arc<SharedRuntime<PluginRuntime>> {
        if let Some(existing) = &self.reader {
            return Arc::clone(existing);
        }
        let config = self.reader_config.clone();
        let shared = SharedRuntime::spawn(move || {
            let scopes = [PluginScope::Session, PluginScope::Book];
            let mut runtime = PluginRuntime::load_filtered(
                &config.directories,
                config.storage_root.clone(),
                Some(&scopes),
                &config.disabled,
                config.cache.as_deref(),
            )
            .map_err(|error| error.to_string())?;
            runtime.set_storage_root(config.storage_root.clone());
            Ok(runtime)
        });
        self.reader = Some(Arc::clone(&shared));
        shared
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
        let _ = self.with_app_host(|host| host.refresh_settings_registry(&sources));
        crate::plugin::relay::emit(
            "plugin-store:changed",
            serde_json::json!({ "reason": "session" }),
        );
    }

    /// Замена слота runtime чтения уже запущенной фоновой сборкой.
    ///
    /// Используется на старте: прогрев компилирует source- и рабочие плагины в
    /// фоне, а состояние лишь разделяет тот же дескриптор — одна компиляция на
    /// набор вместо конкурирующих загрузок.
    pub fn set_reader_runtime(&mut self, shared: Arc<SharedRuntime<PluginRuntime>>) {
        self.reader = Some(shared);
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
    pub(crate) fn viewer_dir_of(
        runtime: &PluginRuntime,
        plugin_id: &str,
    ) -> Result<PathBuf, String> {
        runtime
            .viewer_dir(plugin_id)
            .ok_or_else(|| format!("модуль рисования плагина не найден: {plugin_id}"))
    }

    /// Список файлов модуля рисования плагина (относительные пути и MIME).
    pub(crate) fn viewer_files_of(
        runtime: &PluginRuntime,
        plugin_id: &str,
    ) -> Result<serde_json::Value, String> {
        let dir = Self::viewer_dir_of(runtime, plugin_id)?;
        let files = crate::plugin::viewer::list_files(&dir).map_err(|error| error.to_string())?;
        serde_json::to_value(files).map_err(|error| error.to_string())
    }

    /// Содержимое файла модуля рисования в base64.
    ///
    /// Путь читается только внутри каталога модуля; содержимое не
    /// интерпретируется и передаётся интерфейсу непрозрачно.
    pub(crate) fn viewer_file_of(
        runtime: &PluginRuntime,
        plugin_id: &str,
        path: &str,
    ) -> Result<serde_json::Value, String> {
        let dir = Self::viewer_dir_of(runtime, plugin_id)?;
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
    pub(crate) fn reader_content_of(
        runtime: &mut PluginRuntime,
        path: &str,
    ) -> Result<serde_json::Value, String> {
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
    pub(crate) fn reader_open_external_of(
        runtime: &mut PluginRuntime,
        path: &str,
    ) -> Result<(), String> {
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

    /// Обложка книги по пути через source-плагин.
    ///
    /// Рабочее место адресует книгу путём и не зависит от открытой библиотеки,
    /// поэтому обложка извлекается из самой книги или из её папки: у generic-
    /// источника — встроенная в EPUB/FB2, у Calibre — соседний файл `cover.*`.
    /// Ответ плагина, совпавший по формату с самой книгой, отбрасывается: это
    /// значит, что плагин вернул файл книги, а не обложку. Возвращает `null`,
    /// если обложки нет.
    pub(crate) fn reader_cover_of(
        runtime: &mut PluginRuntime,
        path: &str,
    ) -> Result<serde_json::Value, String> {
        let name = Self::apply_sandbox(runtime, path)?;
        let book_format = std::path::Path::new(path)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_ascii_lowercase();
        let mut ids = runtime.source_plugin_ids();
        // Библиотеки Calibre распознаются по раскладке и приоритету выше
        // generic-источника, поэтому их обработчик ставится первым: у Calibre
        // обложка — соседний файл, а generic вернул бы саму книгу.
        ids.sort_by_key(|id| {
            let name = runtime.plugin_name(id).unwrap_or_default();
            if name.contains("calibre") {
                0
            } else {
                1
            }
        });
        for id in ids {
            let Ok(output) =
                runtime.invoke_operation(&id, "cover", serde_json::json!({ "path": name }))
            else {
                continue;
            };
            let Ok(value) = serde_json::from_str::<serde_json::Value>(&output) else {
                continue;
            };
            if value.get("data").map(|data| data.is_null()).unwrap_or(true) {
                continue;
            }
            let format = value
                .get("format")
                .and_then(|format| format.as_str())
                .unwrap_or_default()
                .to_ascii_lowercase();
            if format == book_format {
                continue;
            }
            return Ok(value);
        }
        Ok(serde_json::json!({ "data": null }))
    }

    /// Размер и время изменения файла книги (Unix, мс).
    ///
    /// Используется для проверки свежести кэша обложки: `None` — метаданные
    /// недоступны, и запись не считается свежей.
    pub(crate) fn file_fingerprint(path: &str) -> (Option<u64>, Option<i64>) {
        let Ok(metadata) = std::fs::metadata(path) else {
            return (None, None);
        };
        let size = Some(metadata.len());
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as i64);
        (size, mtime_ms)
    }

    /// Актуальная обложка из кэша: `Some(inner)` — запись свежая, где `inner`
    /// это обложка или её отсутствие; `None` — записи нет или файл изменился.
    ///
    /// Кэш читается с диска при первом обращении и удерживается в состоянии.
    pub(crate) fn cover_cache_lookup(
        &mut self,
        path: &str,
        size: Option<u64>,
        mtime_ms: Option<i64>,
    ) -> Option<Option<CoverData>> {
        let root = self.app_state_root.clone();
        let cache = self
            .cover_cache
            .get_or_insert_with(|| CoverCache::load(&root));
        cache
            .fresh(path, size, mtime_ms)
            .map(|entry| entry.cover.clone())
    }

    /// Сохранение обложки книги в кэш в памяти (без записи на диск).
    pub(crate) fn cover_cache_store(
        &mut self,
        path: &str,
        size: Option<u64>,
        mtime_ms: Option<i64>,
        cover: Option<CoverData>,
    ) {
        let root = self.app_state_root.clone();
        let cache = self
            .cover_cache
            .get_or_insert_with(|| CoverCache::load(&root));
        cache.store(path, size, mtime_ms, cover);
    }

    /// Сохранение кэша обложек на диск; ошибка записи не прерывает выдачу.
    pub(crate) fn cover_cache_flush(&mut self) {
        if let Some(cache) = &self.cover_cache {
            let _ = cache.save(&self.app_state_root);
        }
    }

    /// Разбор ответа плагина обложки в данные кэша.
    ///
    /// `{data: null}` или пустые данные дают `None` — обложки нет.
    pub(crate) fn cover_data_from_value(value: &serde_json::Value) -> Option<CoverData> {
        let data = value.get("data")?.as_str()?;
        if data.is_empty() {
            return None;
        }
        let format = value
            .get("format")
            .and_then(|format| format.as_str())
            .unwrap_or("jpeg")
            .to_ascii_lowercase();
        Some(CoverData {
            format,
            data: data.to_string(),
        })
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
