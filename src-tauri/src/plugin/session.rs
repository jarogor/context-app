//! Generic состояние активного plugin.

use std::path::{Path, PathBuf};

use crate::constants::PLUGINS_DIR_NAME;

use super::{PluginError, PluginRuntime};

/// Generic состояние директории, обслуживаемой plugin lifecycle.
pub struct PluginSession {
    root: PathBuf,
    active_plugin: Option<String>,
    runtime: PluginRuntime,
    bundled_plugins_dir: PathBuf,
    user_plugins_dir: Option<PathBuf>,
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
        }
    }

    /// Настройка пользовательского каталога плагинов приложения.
    pub fn set_user_plugins_dir(&mut self, dir: PathBuf) {
        self.user_plugins_dir = Some(dir);
    }

    /// Настройка активного plugin и его sandbox.
    pub fn configure(
        &mut self,
        root: impl Into<PathBuf>,
        plugin: String,
        writable: bool,
        storage_root: impl Into<PathBuf>,
    ) -> Result<(), PluginError> {
        let root = root.into();
        let root = if root.is_absolute() {
            root
        } else {
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .parent()
                .expect("родитель папки src-tauri")
                .join(root)
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
        let storage_root = resolve_project_path(storage_root.into());
        self.runtime = Self::load_runtime(
            &root,
            &self.bundled_plugins_dir,
            &storage_root,
            self.user_plugins_dir.as_deref(),
        )?;
        self.runtime.set_sandbox_root(root.clone());
        self.runtime.set_sandbox_writable(writable);
        self.root = root;
        self.active_plugin = Some(plugin);
        Ok(())
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

    fn load_runtime(
        root: &Path,
        bundled: &Path,
        storage_root: &Path,
        user_plugins: Option<&Path>,
    ) -> Result<PluginRuntime, PluginError> {
        let directories = plugin_directories(root, bundled, user_plugins);
        let mut runtime = PluginRuntime::load(&directories, root)?;
        runtime.set_storage_root(storage_root.to_path_buf());
        Ok(runtime)
    }
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
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("родитель папки src-tauri")
        .join(path)
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
