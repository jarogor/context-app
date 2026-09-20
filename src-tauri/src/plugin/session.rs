//! Generic состояние активного plugin.

use std::path::{Path, PathBuf};

use super::{PluginError, PluginRuntime};

/// Generic состояние директории, обслуживаемой plugin lifecycle.
pub struct PluginSession {
    root: PathBuf,
    active_plugin: Option<String>,
    runtime: PluginRuntime,
    bundled_plugins_dir: PathBuf,
    storage_root: PathBuf,
}

impl PluginSession {
    /// Создание пустого plugin host состояния.
    pub fn idle(root: PathBuf, bundled: PathBuf, storage_root: PathBuf) -> Self {
        Self {
            root,
            active_plugin: None,
            runtime: PluginRuntime::empty(),
            bundled_plugins_dir: bundled,
            storage_root,
        }
    }

    /// Настройка активного plugin и его sandbox.
    pub fn configure(
        &mut self,
        root: impl Into<PathBuf>,
        plugin: String,
        writable: bool,
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
        self.runtime = Self::load_runtime(&root, &self.bundled_plugins_dir, &self.storage_root)?;
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

    fn load_runtime(
        root: &Path,
        bundled: &Path,
        storage_root: &Path,
    ) -> Result<PluginRuntime, PluginError> {
        let mut directories = vec![bundled.to_path_buf()];
        let development_plugins = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("plugins");
        if development_plugins != *bundled && development_plugins.is_dir() {
            directories.push(development_plugins);
        }
        let mut runtime = PluginRuntime::load(&directories, root)?;
        runtime.set_storage_root(storage_root.to_path_buf());
        Ok(runtime)
    }
}

#[cfg(test)]
#[path = "session_tests.rs"]
mod tests;
