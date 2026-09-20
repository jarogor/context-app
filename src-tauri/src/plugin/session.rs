//! Generic состояние активного source-плагина.

use std::path::{Path, PathBuf};

use super::{PluginError, PluginRuntime};

/// Generic состояние директории, обслуживаемой plugin lifecycle.
pub struct PluginHostSession {
    root: PathBuf,
    kind: String,
    provider: Option<String>,
    indexing: bool,
    stage: String,
    runtime: PluginRuntime,
    bundled_plugins_dir: PathBuf,
    storage_root: PathBuf,
}

impl PluginHostSession {
    /// Создание idle-сессии до явного выбора source-корня пользователем.
    pub fn idle(root: PathBuf, bundled: PathBuf, storage_root: PathBuf) -> Self {
        Self {
            root,
            kind: "portable".into(),
            provider: None,
            indexing: false,
            stage: "idle".into(),
            runtime: PluginRuntime::empty(),
            bundled_plugins_dir: bundled,
            storage_root,
        }
    }

    /// Создание временной сессии выбора source-корня.
    pub fn open_for_selection(
        root: impl Into<PathBuf>,
        bundled: PathBuf,
        storage_root: PathBuf,
    ) -> Result<Self, PluginError> {
        let root = root.into();
        if !root.is_dir() {
            return Err(PluginError::Call {
                plugin: "runtime".into(),
                message: format!("путь не является директорией: {}", root.display()),
            });
        }
        let runtime = Self::load_runtime(&root, &bundled, &storage_root)?;
        Ok(Self {
            root,
            kind: "portable".into(),
            provider: None,
            indexing: false,
            stage: "opening".into(),
            runtime,
            bundled_plugins_dir: bundled,
            storage_root,
        })
    }

    /// Открытие source-корня и загрузка plugin runtime.
    pub fn open(
        root: impl Into<PathBuf>,
        bundled: PathBuf,
        storage_root: PathBuf,
    ) -> Result<Self, PluginError> {
        let root = root.into();
        let runtime = Self::load_runtime(&root, &bundled, &storage_root)?;
        Ok(Self {
            root,
            kind: "portable".into(),
            provider: None,
            indexing: false,
            stage: "ready".into(),
            runtime,
            bundled_plugins_dir: bundled,
            storage_root,
        })
    }

    /// Определение и открытие provider plugin.
    pub fn prepare_selected(
        root: &Path,
        bundled: PathBuf,
        storage_root: PathBuf,
    ) -> Result<(bool, Option<String>), PluginError> {
        let mut runtime = Self::load_runtime(root, &bundled, &storage_root)?;
        runtime.set_sandbox_root(root.to_path_buf());
        runtime.set_sandbox_writable(false);
        for name in runtime.source_names() {
            runtime.source_capabilities(&name)?;
            if runtime.source_probe(&name)? {
                return Ok((true, Some(name)));
            }
        }
        Ok((false, None))
    }

    /// Публикация внешней source-сессии.
    pub fn promote_provider(&mut self, provider: String) -> Result<(), PluginError> {
        self.runtime =
            Self::load_runtime(&self.root, &self.bundled_plugins_dir, &self.storage_root)?;
        self.runtime.set_sandbox_root(self.root.clone());
        self.runtime.set_sandbox_writable(false);
        self.runtime.source_open(&provider)?;
        self.kind = "external".into();
        self.provider = Some(provider);
        self.indexing = false;
        self.stage = "ready".into();
        Ok(())
    }

    /// Вызов opaque operation активного source-плагина.
    pub fn invoke(
        &mut self,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let provider = self.provider.clone().ok_or_else(|| PluginError::Call {
            plugin: "runtime".into(),
            message: "source-плагин не выбран".into(),
        })?;
        self.runtime
            .invoke_source_operation(&provider, operation, payload)
    }

    /// Синхронизация состояния provider plugin.
    pub fn sync(&mut self) -> Result<(), PluginError> {
        let payload = if self.kind == "portable" {
            serde_json::json!({ "mode": "portable" })
        } else {
            serde_json::json!({})
        };
        self.invoke("sync", payload)?;
        Ok(())
    }

    /// Корень сессии.
    pub fn root(&self) -> &Path {
        &self.root
    }
    /// Тип сессии.
    pub fn kind(&self) -> &str {
        &self.kind
    }
    /// Provider plugin.
    pub fn provider(&self) -> Option<&str> {
        self.provider.as_deref()
    }
    /// Признак фонового открытия.
    pub fn is_indexing(&self) -> bool {
        self.indexing
    }
    /// Этап lifecycle.
    pub fn stage(&self) -> &str {
        &self.stage
    }
    /// Установка этапа lifecycle.
    pub fn set_stage(&mut self, stage: &str) {
        self.stage = stage.to_string();
    }
    /// Runtime для диагностики.
    pub fn runtime(&self) -> &PluginRuntime {
        &self.runtime
    }
    /// Runtime для host actions.
    pub fn runtime_mut(&mut self) -> &mut PluginRuntime {
        &mut self.runtime
    }

    /// Установка состояния source-сессии после generic lifecycle-вызова.
    pub fn set_source(&mut self, provider: String, kind: &str) {
        self.provider = Some(provider);
        self.kind = kind.to_string();
        self.indexing = false;
        self.stage = "ready".to_string();
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
