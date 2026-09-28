//! Generic состояние активного plugin.

use std::path::{Path, PathBuf};

use crate::constants::PLUGINS_DIR_NAME;

use super::{get_bus, PluginError, PluginRuntime, Severity};

/// Generic состояние директории, обслуживаемой plugin lifecycle.
pub struct PluginSession {
    root: PathBuf,
    active_plugin: Option<String>,
    runtime: PluginRuntime,
    bundled_plugins_dir: PathBuf,
    user_plugins_dir: Option<PathBuf>,
    disabled_plugins: Vec<String>,
    applied_disabled: Vec<String>,
    wasm_cache: Option<PathBuf>,
}

impl PluginSession {
    /// Создание пустого plugin host состояния.
    pub fn idle(root: PathBuf, bundled: PathBuf) -> Self {
        Self {
            root,
            active_plugin: None,
            runtime: PluginRuntime::empty(),
            bundled_plugins_dir: bundled,
            user_plugins_dir: None,
            disabled_plugins: Vec::new(),
            applied_disabled: Vec::new(),
            wasm_cache: None,
        }
    }

    /// Настройка пользовательского каталога плагинов приложения.
    pub fn set_user_plugins_dir(&mut self, dir: PathBuf) {
        self.user_plugins_dir = Some(dir);
    }

    /// Настройка конфигурации постоянного кэша компиляции WASM.
    ///
    /// `None` оставляет системный кэш wasmtime по умолчанию.
    pub fn set_wasm_cache(&mut self, cache_config: Option<PathBuf>) {
        self.wasm_cache = cache_config;
    }

    /// Настройка списка отключённых плагинов.
    pub fn set_disabled_plugins(&mut self, disabled: Vec<String>) {
        self.disabled_plugins = disabled;
    }

    /// Пометка текущего набора активности применённым.
    ///
    /// Используется на старте: сохранённый реестр уже действует, ждать
    /// перезагрузки нечего.
    pub fn mark_activation_applied(&mut self) {
        self.applied_disabled = self.disabled_plugins.clone();
    }

    /// Есть ли не применённые изменения активности плагинов.
    ///
    /// Сравнивает желаемый набор отключённых с набором, применённым при
    /// последней загрузке плагинов.
    pub fn activation_pending(&self) -> bool {
        let mut desired = self.disabled_plugins.clone();
        let mut applied = self.applied_disabled.clone();
        desired.sort();
        desired.dedup();
        applied.sort();
        applied.dedup();
        desired != applied
    }

    /// Настройка активного plugin и его sandbox.
    pub fn configure(
        &mut self,
        root: impl Into<PathBuf>,
        plugin: String,
        writable: bool,
        storage_root: impl Into<PathBuf>,
    ) -> Result<(), PluginError> {
        let root = self.prepare(root.into(), writable)?;
        self.install(&root, storage_root.into(), writable)?;
        self.active_plugin = Some(plugin);
        Ok(())
    }

    /// Выбор source-плагина для корня по `probe` с приоритетом.
    ///
    /// Опрашивает загруженные source-плагины и настраивает сессию на
    /// подтвердивший корень с наибольшим приоритетом. Возвращает идентификатор
    /// выбранного провайдера.
    pub fn select_source(
        &mut self,
        root: impl Into<PathBuf>,
        writable: bool,
        storage_root: impl Into<PathBuf>,
    ) -> Result<String, PluginError> {
        let root = match self.prepare(root.into(), writable) {
            Ok(root) => root,
            Err(error) => {
                get_bus().publish_technical(
                    Severity::Warn,
                    format!("Библиотека недоступна: {error}"),
                    "core",
                    serde_json::json!({}),
                );
                return Err(error);
            }
        };
        if let Err(error) = self.install(&root, storage_root.into(), writable) {
            get_bus().publish_technical(
                Severity::Warn,
                format!("Не удалось загрузить плагины библиотеки: {error}"),
                "core",
                serde_json::json!({}),
            );
            return Err(error);
        }

        let mut candidates = Vec::new();
        for id in self.runtime.source_plugin_ids() {
            match self.runtime.probe_priority(&id) {
                Ok(Some(priority)) => candidates.push((id, priority)),
                Ok(None) => {}
                Err(error) => {
                    get_bus().publish_technical(
                        Severity::Warn,
                        format!("Опрос source-плагина не удался: {error}"),
                        "core",
                        serde_json::json!({}),
                    );
                }
            }
        }

        let Some(provider) = pick_best(candidates) else {
            get_bus().publish_technical(
                Severity::Warn,
                "Ни один source-плагин не подтвердил директорию",
                "core",
                serde_json::json!({}),
            );
            return Err(PluginError::Call {
                plugin: "runtime".into(),
                message: "ни один source-плагин не подтвердил директорию".into(),
            });
        };
        self.active_plugin = Some(provider.clone());
        Ok(provider)
    }

    /// Идентификатор активного плагина сессии.
    pub fn active_plugin(&self) -> Option<&str> {
        self.active_plugin.as_deref()
    }

    /// Активная библиотека: путь, идентификатор и имя провайдера.
    ///
    /// Возвращает `None`, пока библиотека не открыта.
    pub fn active_library(&self) -> Option<(String, String, String)> {
        let provider = self.active_plugin.clone()?;
        let path = self.root.to_string_lossy().to_string();
        let provider_name = self.runtime.plugin_name(&provider).unwrap_or_default();
        Some((path, provider, provider_name))
    }

    /// Человекочитаемое имя плагина по идентификатору.
    pub fn plugin_name(&self, id: &str) -> Option<String> {
        self.runtime.plugin_name(id)
    }

    /// Вызов opaque operation активного plugin-а.
    pub fn invoke(
        &mut self,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let plugin = self
            .active_plugin
            .clone()
            .ok_or_else(|| PluginError::Call {
                plugin: "runtime".into(),
                message: "plugin не выбран".into(),
            })?;
        self.runtime.invoke_operation(&plugin, operation, payload)
    }

    /// Корень сессии.
    pub fn root(&self) -> &Path {
        &self.root
    }
    /// Runtime для диагностики.
    pub fn runtime(&self) -> &PluginRuntime {
        &self.runtime
    }
    /// Runtime для host actions.
    pub fn runtime_mut(&mut self) -> &mut PluginRuntime {
        &mut self.runtime
    }

    /// Декларации настроек плагинов активной сессии.
    pub fn settings_sources(&self) -> Vec<serde_json::Value> {
        self.runtime.settings_sources()
    }

    /// Доступные source-плагины из директорий сессии.
    ///
    /// Плагины обнаруживаются по манифестам без загрузки WASM.
    pub fn available_source_plugins(&self) -> Vec<crate::plugin::SourceProvider> {
        let directories = plugin_directories(
            &self.root,
            &self.bundled_plugins_dir,
            self.user_plugins_dir.as_deref(),
        );
        crate::plugin::discover_source_plugins(&directories)
    }

    /// Разрешение и проверка корня перед загрузкой runtime.
    fn prepare(&self, root: PathBuf, writable: bool) -> Result<PathBuf, PluginError> {
        let root = if root.is_absolute() {
            root
        } else {
            project_root().join(root)
        };
        if writable {
            std::fs::create_dir_all(&root).map_err(|error| PluginError::Call {
                plugin: "runtime".into(),
                message: format!("не удалось подготовить sandbox: {error}"),
            })?;
        }
        if !root.is_dir() {
            return Err(PluginError::Call {
                plugin: "runtime".into(),
                message: format!("путь не является директорией: {}", root.display()),
            });
        }
        Ok(root)
    }

    /// Загрузка runtime, установка sandbox и корня сессии.
    fn install(
        &mut self,
        root: &Path,
        storage_root: PathBuf,
        writable: bool,
    ) -> Result<(), PluginError> {
        let storage_root = resolve_project_path(storage_root);
        self.runtime = Self::load_runtime(
            root,
            &self.bundled_plugins_dir,
            &storage_root,
            self.user_plugins_dir.as_deref(),
            &self.disabled_plugins,
            self.wasm_cache.as_deref(),
        )?;
        self.runtime.set_sandbox_root(root.to_path_buf());
        self.runtime.set_sandbox_writable(writable);
        self.root = root.to_path_buf();
        self.applied_disabled = self.disabled_plugins.clone();
        Ok(())
    }

    fn load_runtime(
        root: &Path,
        bundled: &Path,
        storage_root: &Path,
        user_plugins: Option<&Path>,
        disabled: &[String],
        cache_config: Option<&Path>,
    ) -> Result<PluginRuntime, PluginError> {
        let directories = plugin_directories(root, bundled, user_plugins);
        let mut runtime =
            PluginRuntime::load_filtered(&directories, root, None, disabled, cache_config)?;
        runtime.set_storage_root(storage_root.to_path_buf());
        Ok(runtime)
    }
}

/// Выбор провайдера с наибольшим приоритетом; при равенстве — первый.
fn pick_best(candidates: Vec<(String, i32)>) -> Option<String> {
    let mut best: Option<(String, i32)> = None;
    for (name, priority) in candidates {
        match &best {
            Some((_, current)) if *current >= priority => {}
            _ => best = Some((name, priority)),
        }
    }
    best.map(|(name, _)| name)
}

/// Корень проекта приложения.
fn project_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("родитель папки src-tauri")
        .to_path_buf()
}

/// Директории загрузки плагинов в порядке приоритета.
///
/// При совпадении имён побеждает первый загруженный плагин, поэтому порядок
/// задаёт приоритет: `plugins/` библиотеки, пользовательский каталог
/// приложения, поставляемые ресурсы и dev-ресурсы.
fn plugin_directories(root: &Path, bundled: &Path, user_plugins: Option<&Path>) -> Vec<PathBuf> {
    let mut directories = vec![root.join(PLUGINS_DIR_NAME)];
    if let Some(user) = user_plugins {
        directories.push(user.to_path_buf());
    }
    directories.push(bundled.to_path_buf());
    let development_plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join(PLUGINS_DIR_NAME);
    if development_plugins != *bundled && development_plugins.is_dir() {
        directories.push(development_plugins);
    }
    directories
}

/// Разрешение относительного plugin storage от корня проекта.
fn resolve_project_path(path: PathBuf) -> PathBuf {
    if path.is_absolute() {
        return path;
    }
    project_root().join(path)
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
