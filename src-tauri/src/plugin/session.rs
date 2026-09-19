//! Generic состояние активной plugin-сессии.

use std::fs;
use std::path::{Path, PathBuf};

use super::{PluginError, PluginRuntime};

/// Generic состояние директории, обслуживаемой plugin lifecycle.
pub struct PluginSession {
    root: PathBuf,
    kind: String,
    provider: Option<String>,
    indexing: bool,
    stage: String,
    runtime: PluginRuntime,
    bundled_plugins_dir: PathBuf,
}

impl PluginSession {
    /// Создание временной сессии выбора директории.
    pub fn open_for_selection(
        root: impl Into<PathBuf>,
        bundled: PathBuf,
    ) -> Result<Self, PluginError> {
        let root = root.into();
        if !root.is_dir() {
            return Err(PluginError::Call {
                plugin: "runtime".into(),
                message: format!("путь не является директорией: {}", root.display()),
            });
        }
        Ok(Self {
            root,
            kind: "portable".into(),
            provider: None,
            indexing: true,
            stage: "opening".into(),
            runtime: PluginRuntime::empty(),
            bundled_plugins_dir: bundled,
        })
    }

    /// Открытие директории и загрузка plugin runtime.
    pub fn open(root: impl Into<PathBuf>, bundled: PathBuf) -> Result<Self, PluginError> {
        let root = root.into();
        let runtime = Self::load_runtime(&root, &bundled)?;
        Ok(Self {
            root,
            kind: "portable".into(),
            provider: None,
            indexing: false,
            stage: "ready".into(),
            runtime,
            bundled_plugins_dir: bundled,
        })
    }

    /// Определение и открытие provider plugin.
    pub fn prepare_selected(
        root: &Path,
        bundled: PathBuf,
    ) -> Result<(bool, Option<String>), PluginError> {
        eprintln!("[session] loading runtime for {}", root.display());
        let mut runtime = Self::load_runtime(root, &bundled)?;
        eprintln!("[session] runtime loaded: {:?}", runtime.plugin_names());
        runtime.set_sandbox_root(root.to_path_buf());
        runtime.set_sandbox_writable(false);
        for name in runtime.source_names() {
            eprintln!("[session] checking source capabilities: {name}");
            runtime.source_capabilities(&name)?;
            eprintln!("[session] probing source: {name}");
            if runtime.source_probe(&name)? {
                eprintln!("[session] opening source: {name}");
                runtime.source_open(&name)?;
                return Ok((true, Some(name)));
            }
        }
        Ok((false, None))
    }

    /// Публикация external provider session.
    pub fn promote_provider(&mut self, provider: String) -> Result<(), PluginError> {
        self.runtime = Self::load_runtime(&self.root, &self.bundled_plugins_dir)?;
        self.runtime.set_sandbox_root(self.root.clone());
        self.runtime.source_open(&provider)?;
        self.kind = "external".into();
        self.provider = Some(provider);
        self.indexing = false;
        self.stage = "ready".into();
        Ok(())
    }

    /// Публикация portable provider session.
    pub fn install_portable(&mut self) -> Result<(), PluginError> {
        seed_plugins(&self.root, &self.bundled_plugins_dir)?;
        self.runtime = Self::load_runtime(&self.root, &self.bundled_plugins_dir)?;
        self.runtime.set_sandbox_root(self.root.clone());
        self.runtime.set_sandbox_writable(true);
        self.runtime.invoke_capability(
            "library.catalog@1",
            "open",
            serde_json::json!({ "mode": "portable" }),
        )?;
        self.kind = "portable".into();
        self.provider = None;
        self.indexing = false;
        self.stage = "ready".into();
        Ok(())
    }

    /// Вызов opaque lifecycle operation.
    pub fn invoke(
        &mut self,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        self.runtime
            .invoke_capability("library.catalog@1", operation, payload)
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

    fn load_runtime(root: &Path, bundled: &Path) -> Result<PluginRuntime, PluginError> {
        let directories = vec![root.join("plugins"), bundled.to_path_buf()];
        let mut runtime = PluginRuntime::load(&directories, root)?;
        runtime.set_storage_root(root.with_extension("source-state"));
        Ok(runtime)
    }
}

fn seed_plugins(root: &Path, bundled: &Path) -> Result<(), PluginError> {
    if !bundled.is_dir() {
        return Ok(());
    }
    let destination = root.join("plugins");
    fs::create_dir_all(&destination)?;
    for entry in fs::read_dir(bundled)? {
        let entry = entry?;
        if !entry.file_type()?.is_dir() {
            continue;
        }
        let target = destination.join(entry.file_name());
        if target.exists() {
            continue;
        }
        fs::create_dir_all(&target)?;
        for file in fs::read_dir(entry.path())? {
            let file = file?;
            if file.file_type()?.is_file() {
                fs::copy(file.path(), target.join(file.file_name()))?;
            }
        }
    }
    Ok(())
}
