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

    /// Чтение части файла: как у host-функции, диапазон за концом короче.
    fn read_range(&self, path: &str, offset: u64, length: u64) -> Result<Vec<u8>, String> {
        use std::io::{Read, Seek, SeekFrom};
        // Обращение к файлу считается чтением: тесты проверяют, что неизменные
        // книги не перечитываются при повторном открытии.
        self.reads.set(self.reads.get() + 1);
        let full = self
            .root
            .join(path.replace('/', std::path::MAIN_SEPARATOR_STR));
        let mut file = fs::File::open(full).map_err(|error| error.to_string())?;
        file.seek(SeekFrom::Start(offset))
            .map_err(|error| error.to_string())?;
        let mut bytes = Vec::new();
        file.take(length)
            .read_to_end(&mut bytes)
            .map_err(|error| error.to_string())?;
        Ok(bytes)
    }

    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String> {
        fs::read(path).map_err(|error| error.to_string())
    }

    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String> {
        let target = self.root.join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        fs::write(target, bytes).map_err(|error| error.to_string())
    }

    fn open_file(&self, _path: &str) -> Result<(), String> {
        Ok(())
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
