//! Глобальный handle для инъекции журнала.
//!
//! Позволяет доменным модулям эмитировать события в журнал без прямого
//! доступа к Tauri-состоянию и без изменения сигнатур конструкторов.

use crate::journal::{Entry, Level, Severity};

use std::sync::{Arc, OnceLock};

/// Глобальный handle журнала.
///
/// Использует OnceLock для ленивой инициализации и Arc<Mutex<Journal>>
/// для безопасного доступа из разных потоков.
pub struct JournalHandle {
    journal: Arc<std::sync::Mutex<crate::journal::Journal>>,
}

impl JournalHandle {
    /// Создаёт новый пустой handle.
    pub fn new() -> Self {
        Self {
            journal: Arc::new(std::sync::Mutex::new(crate::journal::Journal::new())),
        }
    }

    /// Создаёт no-op handle для тестов.
    pub fn new_noop() -> Self {
        Self::new()
    }

    /// Добавляет событие пользовательского уровня.
    pub fn add_user(
        &self,
        message: impl Into<String>,
        severity: Severity,
        source: impl Into<String>,
        details: impl Into<serde_json::Value>,
    ) {
        let mut journal = self.journal.lock().unwrap();
        let entry = journal.add_user(message, severity, source, details);
        super::commands::notify_journal_entry(entry);
    }

    /// Добавляет событие технического уровня.
    pub fn add_technical(
        &self,
        message: impl Into<String>,
        source: impl Into<String>,
        details: impl Into<serde_json::Value>,
    ) {
        let mut journal = self.journal.lock().unwrap();
        let entry = journal.add_technical(message, source, details);
        super::commands::notify_journal_entry(entry);
    }

    /// Возвращает непрочитанные записи указанного уровня.
    pub fn unread(&self, level: Level) -> Vec<Entry> {
        let journal = self.journal.lock().unwrap();
        journal.unread(level)
    }

    /// Помечает записи как прочитанные.
    pub fn mark_read(&self, ids: &[u64]) {
        let mut journal = self.journal.lock().unwrap();
        journal.mark_read(ids);
    }

    /// Помечает все записи как прочитанными.
    pub fn mark_all_read(&self) {
        let mut journal = self.journal.lock().unwrap();
        journal.mark_all_read();
    }

    /// Очищает весь журнал.
    pub fn clear(&self) {
        let mut journal = self.journal.lock().unwrap();
        journal.clear();
    }

    /// Возвращает все записи.
    pub fn all(&self, level: Option<Level>) -> Vec<Entry> {
        let journal = self.journal.lock().unwrap();
        match level {
            Some(l) => journal.filter_by_level(l),
            None => journal.all(),
        }
    }

    /// Возвращает количество непрочитанных записей указанного уровня.
    pub fn unread_count(&self, level: Level) -> usize {
        let journal = self.journal.lock().unwrap();
        journal.unread_count(level)
    }
}

impl std::fmt::Debug for JournalHandle {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("JournalHandle { journal: <locked> }")
    }
}

impl Default for JournalHandle {
    fn default() -> Self {
        Self::new()
    }
}

/// Глобальный экземпляр handle.
static GLOBAL_JOURNAL_HANDLE: OnceLock<JournalHandle> = OnceLock::new();

/// Возвращает глобальный handle журнала.
pub fn get_journal_handle() -> &'static JournalHandle {
    GLOBAL_JOURNAL_HANDLE.get_or_init(JournalHandle::new)
}

/// Устанавливает глобальный handle (для инъекции в тесты или при инициализации).
pub fn set_journal_handle(handle: JournalHandle) {
    GLOBAL_JOURNAL_HANDLE
        .set(handle)
        .expect("JournalHandle already set");
}
