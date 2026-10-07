//! Общие корни runtime и состояние host-функций.
//!
//! `RuntimeRoots` хранит песочный корень, корни служебного хранилища и стора,
//! директории перечня плагинов и режим записи. Через `Arc` они разделяются между
//! самим runtime и экземплярами host-функций, поэтому смена корня отражается во
//! всех вызовах. Здесь же — проверки безопасных относительных путей внутри
//! песочницы и ключей служебного хранилища.

use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

/// Общие корни и переключатели runtime.
#[derive(Clone)]
pub(super) struct RuntimeRoots {
    /// Песочный корень для host-функций файловой системы plugin-а.
    pub(super) sandbox_root: Arc<Mutex<SandboxRoot>>,
    /// Корень служебного хранилища source-плагина.
    pub(super) storage_root: Arc<Mutex<Option<PathBuf>>>,
    /// Корень пользовательского каталога плагинов для стора.
    pub(super) plugin_store_root: Arc<Mutex<Option<PathBuf>>>,
    /// Корень реестра активности плагинов.
    pub(super) activation_root: Arc<Mutex<Option<PathBuf>>>,
    /// Директории, из которых загружены плагины.
    pub(super) catalog_dirs: Arc<Mutex<Vec<PathBuf>>>,
    /// Разрешена ли запись в sandbox.
    pub(super) sandbox_writable: Arc<Mutex<bool>>,
}

impl RuntimeRoots {
    /// Создание корней с начальным песочным корнем и директориями перечня.
    pub(super) fn new(sandbox_root: PathBuf, catalog_dirs: Vec<PathBuf>) -> Self {
        Self {
            sandbox_root: Arc::new(Mutex::new(SandboxRoot::new(sandbox_root))),
            storage_root: Arc::new(Mutex::new(None)),
            plugin_store_root: Arc::new(Mutex::new(None)),
            activation_root: Arc::new(Mutex::new(None)),
            catalog_dirs: Arc::new(Mutex::new(catalog_dirs)),
            sandbox_writable: Arc::new(Mutex::new(false)),
        }
    }

    /// Настроенный корень служебного хранилища плагина.
    pub(super) fn storage_root(&self) -> Result<PathBuf, String> {
        self.storage_root
            .lock()
            .map_err(|_| "служебное хранилище недоступно".to_string())?
            .clone()
            .ok_or_else(|| "служебное хранилище не настроено".to_string())
    }

    /// Настроенный корень пользовательского каталога плагинов для стора.
    pub(super) fn store_root(&self) -> Result<PathBuf, extism::Error> {
        self.plugin_store_root
            .lock()
            .map_err(|_| extism::Error::msg("корень стора плагинов недоступен"))?
            .clone()
            .ok_or_else(|| extism::Error::msg("корень стора плагинов не настроен"))
    }

    /// Состояние host-функций для плагина-владельца.
    pub(super) fn host_state(&self, plugin_id: &str) -> HostState {
        HostState {
            roots: self.clone(),
            plugin_id: plugin_id.to_string(),
            sqlite: Arc::new(Mutex::new(None)),
        }
    }
}

/// Песочный корень host-функций с кэшем канонизированного пути.
///
/// Канонизация корня выполняется один раз и кэшируется: корень меняется редко, а
/// резолв путей вызывается на каждое обращение плагина к файловой системе.
#[derive(Clone)]
pub(super) struct SandboxRoot {
    /// Исходный путь корня.
    path: PathBuf,
    /// Кэш канонизированного пути, заполняется при первом резолве.
    canonical: Option<PathBuf>,
}

impl SandboxRoot {
    /// Создание корня без кэша канонизированного пути.
    pub(super) fn new(path: PathBuf) -> Self {
        Self {
            path,
            canonical: None,
        }
    }

    /// Канонизированный корень или исходный путь, если канонизация невозможна.
    pub(super) fn canonical_or_self(&mut self) -> PathBuf {
        match self.canonical() {
            Ok(path) => path,
            Err(_) => self.path.clone(),
        }
    }

    /// Канонизированный корень с заполнением кэша при первом обращении.
    fn canonical(&mut self) -> io::Result<PathBuf> {
        if let Some(cached) = &self.canonical {
            return Ok(cached.clone());
        }
        let canonical = self.path.canonicalize().map_err(|error| {
            io::Error::new(
                io::ErrorKind::PermissionDenied,
                format!("корень недоступен: {error}"),
            )
        })?;
        self.canonical = Some(canonical.clone());
        Ok(canonical)
    }
}

/// Состояние host-функций runtime: общие корни, владелец SQL и соединение.
#[derive(Clone)]
pub(super) struct HostState {
    /// Общие корни и переключатели runtime.
    pub(super) roots: RuntimeRoots,
    /// Идентификатор плагина-владельца SQL-хранилища.
    pub(super) plugin_id: String,
    /// Ленивое соединение с SQLite-базой, изолированной на библиотеку.
    pub(super) sqlite: Arc<Mutex<Option<rusqlite::Connection>>>,
}

impl HostState {
    /// Настроенный корень служебного хранилища плагина.
    pub(super) fn storage_root(&self) -> Result<PathBuf, String> {
        self.roots.storage_root()
    }

    /// Настроенный корень пользовательского каталога плагинов для стора.
    pub(super) fn store_root(&self) -> Result<PathBuf, extism::Error> {
        self.roots.store_root()
    }
}

/// Разрешение ключа storage внутри отдельного корня состояния.
pub(crate) fn resolve_storage_key(state: &HostState, key: &str) -> io::Result<PathBuf> {
    if key.is_empty()
        || key == "."
        || key == ".."
        || key.contains('/')
        || key.contains('\\')
        || Path::new(key).is_absolute()
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "некорректный ключ storage",
        ));
    }
    let root = state
        .storage_root()
        .map_err(|message| io::Error::new(io::ErrorKind::PermissionDenied, message))?;
    Ok(root.join(key))
}

/// Разрешение относительного пути внутри песочного корня.
///
/// Возвращает канонический путь кандидата только если он лежит строго внутри
/// канонизированного корня. Ошибка не содержит пути, чтобы не раскрывать
/// структуру файловой системы за пределами песочницы.
pub(crate) fn resolve_sandboxed(
    root: &Arc<Mutex<SandboxRoot>>,
    relative: &str,
) -> io::Result<PathBuf> {
    let mut root = root
        .lock()
        .map_err(|_| io::Error::other("песочный корень недоступен"))?;
    let root_path = root.canonical()?;
    let candidate = root_path.join(relative).canonicalize().map_err(|error| {
        io::Error::new(
            io::ErrorKind::NotFound,
            format!("путь не существует: {error}"),
        )
    })?;
    if !candidate.starts_with(&root_path) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "путь вне песочницы",
        ));
    }
    Ok(candidate)
}

/// Разрешение пути записи внутри sandbox, включая новый файл.
pub(crate) fn resolve_sandboxed_for_write(
    root: &Arc<Mutex<SandboxRoot>>,
    relative: &str,
) -> io::Result<PathBuf> {
    if relative.is_empty()
        || Path::new(relative).is_absolute()
        || Path::new(relative)
            .components()
            .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "путь вне песочницы",
        ));
    }
    let mut root = root
        .lock()
        .map_err(|_| io::Error::other("песочный корень недоступен"))?;
    let root_path = root.canonical()?;
    let candidate = root_path.join(relative);
    let parent = candidate
        .parent()
        .ok_or_else(|| io::Error::new(io::ErrorKind::PermissionDenied, "путь вне песочницы"))?
        .canonicalize()?;
    if !parent.starts_with(&root_path) {
        return Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "путь вне песочницы",
        ));
    }
    Ok(candidate)
}
