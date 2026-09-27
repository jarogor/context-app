//! Тестовая файловая система плагина.
//!
//! В WASM-окружении доступ к файлам и SQL предоставляют host-функции. В
//! нативных тестах используется эта реализация: файлы читаются из временной
//! папки, SQL исполняется настоящим SQLite (`crate::test_sql`), а число
//! прочитанных файлов доступно для проверки инкрементальности.

use std::cell::{Cell, RefCell};
use std::fs;
use std::path::PathBuf;

use crate::fs::Fs;
use crate::models::{DirEntry, EntryKind};

/// Тестовая файловая система поверх временной папки.
pub(crate) struct TestFs {
    /// Корень библиотеки.
    root: PathBuf,
    /// Число прочитанных файлов (для проверки инкрементальности).
    reads: Cell<usize>,
    /// Отказ служебного хранилища.
    fail_state: bool,
    /// Отказ SQL-хранилища.
    fail_sql: bool,
    /// Опубликованные прикладные события.
    events: RefCell<Vec<(String, String)>>,
}

impl TestFs {
    /// Создание тестовой ФС над корнем библиотеки.
    pub(crate) fn new(root: PathBuf) -> Self {
        Self {
            root,
            reads: Cell::new(0),
            fail_state: false,
            fail_sql: false,
            events: RefCell::new(Vec::new()),
        }
    }

    /// Создание тестовой ФС с отказами состояния и SQL.
    pub(crate) fn failing(root: PathBuf) -> Self {
        Self {
            root,
            reads: Cell::new(0),
            fail_state: true,
            fail_sql: true,
            events: RefCell::new(Vec::new()),
        }
    }

    /// Число прочитанных файлов с момента создания.
    pub(crate) fn reads(&self) -> usize {
        self.reads.get()
    }

    /// Сброс счётчика прочитанных файлов.
    pub(crate) fn reset_reads(&self) {
        self.reads.set(0);
    }

    /// Опубликованные прикладные события.
    pub(crate) fn events(&self) -> Vec<(String, String)> {
        self.events.borrow().clone()
    }
}

impl Fs for TestFs {
    fn list_dir(&self, path: &str) -> Result<Vec<DirEntry>, String> {
        let dir = self
            .root
            .join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let mut entries = Vec::new();
        if let Ok(reader) = fs::read_dir(&dir) {
            for entry in reader.flatten() {
                let (kind, size, mtime_ms) = match entry.file_type() {
                    Ok(file_type) if file_type.is_dir() => (EntryKind::Dir, None, None),
                    Ok(file_type) if file_type.is_file() => {
                        let metadata = entry.metadata().ok();
                        let size = metadata.as_ref().map(|value| value.len());
                        let mtime_ms = metadata
                            .as_ref()
                            .and_then(|value| value.modified().ok())
                            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                            .map(|value| value.as_millis() as i64);
                        (EntryKind::File, size, mtime_ms)
                    }
                    _ => (EntryKind::Symlink, None, None),
                };
                entries.push(DirEntry {
                    name: entry.file_name().to_string_lossy().into_owned(),
                    kind,
                    size,
                    mtime_ms,
                });
            }
        }
        entries.sort_by(|left, right| left.name.cmp(&right.name));
        Ok(entries)
    }

    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        self.reads.set(self.reads.get() + 1);
        fs::read(
            self.root
                .join(path.replace('/', std::path::MAIN_SEPARATOR_STR)),
        )
        .map_err(|error| error.to_string())
    }

    fn open_file(&self, _path: &str) -> Result<(), String> {
        Ok(())
    }

    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        if self.fail_state {
            return Ok(None);
        }
        let path = self.root.join(".state").join(key);
        match fs::read_to_string(path) {
            Ok(value) => Ok(Some(value)),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(error) => Err(error.to_string()),
        }
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        if self.fail_state {
            return Err("storage недоступен".to_string());
        }
        let directory = self.root.join(".state");
        fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
        fs::write(directory.join(key), value).map_err(|error| error.to_string())
    }

    fn state_delete(&self, key: &str) -> Result<(), String> {
        if self.fail_state {
            return Ok(());
        }
        match fs::remove_file(self.root.join(".state").join(key)) {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(error) => Err(error.to_string()),
        }
    }

    fn sql_execute(&self, sql: &str, params: &str) -> Result<(), String> {
        if self.fail_sql {
            return Err("SQL-хранилище недоступно".to_string());
        }
        crate::test_sql::execute(&self.root, sql, params)
    }

    fn sql_query(&self, sql: &str, params: &str) -> Result<String, String> {
        if self.fail_sql {
            return Err("SQL-хранилище недоступно".to_string());
        }
        crate::test_sql::query(&self.root, sql, params)
    }

    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String> {
        self.events
            .borrow_mut()
            .push((name.to_string(), payload.to_string()));
        Ok(())
    }
}
