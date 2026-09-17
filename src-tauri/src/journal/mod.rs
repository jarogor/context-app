//! Модуль журнала событий с двумя уровнями: User и Technical.
//!
//! Обеспечивает in-memory append-only журнал с ограничением размера, операции
//! чтения, пометки прочитанных и очистки, а также глобальный handle для инъекции
//! в доменные модули.

pub mod commands;
pub mod entry;
pub mod handle;

pub use commands::set_app_handle;
pub use entry::{Entry, Level, Severity};
pub use handle::{get_journal_handle, set_journal_handle, JournalHandle};

use std::collections::HashSet;
use std::collections::VecDeque;

/// Максимальное количество записей в журнале.
const MAX_ENTRIES: usize = 500;

/// Журнал событий.
///
/// Хранит записи в кольцевом буфере (VecDeque) и поддерживает инкрементный
/// идентификатор, timestamp и пометку прочитанных.
#[derive(Clone)]
pub struct Journal {
    entries: VecDeque<Entry>,
    read_ids: HashSet<u64>,
    next_id: u64,
}

impl Journal {
    /// Создаёт новый пустой журнал.
    pub fn new() -> Self {
        Self {
            entries: VecDeque::with_capacity(MAX_ENTRIES),
            read_ids: HashSet::new(),
            next_id: 0,
        }
    }

    /// Добавляет событие пользовательского уровня.
    pub fn add_user(
        &mut self,
        message: impl Into<String>,
        severity: Severity,
        source: impl Into<String>,
        details: impl Into<serde_json::Value>,
    ) -> Entry {
        self.add(Level::User, message, severity, source, details)
    }

    /// Добавляет событие технического уровня.
    pub fn add_technical(
        &mut self,
        message: impl Into<String>,
        source: impl Into<String>,
        details: impl Into<serde_json::Value>,
    ) -> Entry {
        self.add(Level::Technical, message, Severity::Info, source, details)
    }

    /// Добавляет событие в журнал.
    fn add(
        &mut self,
        level: Level,
        message: impl Into<String>,
        severity: Severity,
        source: impl Into<String>,
        details: impl Into<serde_json::Value>,
    ) -> Entry {
        let id = self.next_id;
        self.next_id += 1;
        let now = std::time::SystemTime::now();
        let ms = now
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_millis() as i64;
        let entry = Entry {
            id,
            timestamp: ms,
            level,
            severity,
            message: message.into(),
            source: source.into(),
            details: details.into(),
            read: false,
        };

        self.entries.push_back(entry.clone());

        if self.entries.len() > MAX_ENTRIES {
            let removed = self.entries.pop_front();
            if let Some(removed_entry) = removed {
                if removed_entry.read {
                    self.read_ids.remove(&removed_entry.id);
                }
            }
        }

        entry
    }

    /// Возвращает все записи.
    pub fn all(&self) -> Vec<Entry> {
        self.entries.iter().cloned().collect()
    }

    /// Возвращает отфильтрованный список записей по уровню.
    pub fn filter_by_level(&self, level: Level) -> Vec<Entry> {
        self.entries
            .iter()
            .filter(|e| e.level == level)
            .cloned()
            .collect()
    }

    /// Возвращает непрочитанные записи указанного уровня.
    pub fn unread(&self, level: Level) -> Vec<Entry> {
        self.entries
            .iter()
            .filter(|e| e.level == level && !e.read)
            .cloned()
            .collect()
    }

    /// Помечает записи как прочитанные.
    pub fn mark_read(&mut self, ids: &[u64]) {
        for &id in ids {
            if let Some(entry) = self.entries.iter_mut().find(|e| e.id == id) {
                entry.read = true;
            }
        }
    }

    /// Помечает все записи как прочитанные.
    pub fn mark_all_read(&mut self) {
        for entry in &mut self.entries {
            entry.read = true;
        }
    }

    /// Очищает весь журнал.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.read_ids.clear();
        self.next_id = 0;
    }

    /// Возвращает количество непрочитанных записей указанного уровня.
    pub fn unread_count(&self, level: Level) -> usize {
        self.unread(level).len()
    }

    /// Возвращает количество всех записей.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Проверяет, пуст ли журнал.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

impl Default for Journal {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_add_user() {
        let mut journal = Journal::new();
        let entry = journal.add_user("Test", Severity::Info, "test", serde_json::json!({}));
        assert_eq!(entry.message, "Test");
        assert_eq!(entry.level, Level::User);
    }

    #[test]
    fn test_add_technical() {
        let mut journal = Journal::new();
        let entry = journal.add_technical("debug", "test", serde_json::json!({}));
        assert_eq!(entry.message, "debug");
        assert_eq!(entry.level, Level::Technical);
    }

    #[test]
    fn test_mark_read() {
        let mut journal = Journal::new();
        let entry = journal.add_user("Test", Severity::Info, "test", serde_json::json!({}));
        journal.mark_read(&[entry.id]);
        assert!(journal.unread(Level::User).is_empty());
    }

    #[test]
    fn test_mark_all_read() {
        let mut journal = Journal::new();
        let _ = journal.add_user("Test1", Severity::Info, "test", serde_json::json!({}));
        let _ = journal.add_user("Test2", Severity::Info, "test", serde_json::json!({}));
        journal.mark_all_read();
        assert!(journal.unread(Level::User).is_empty());
    }

    #[test]
    fn test_clear() {
        let mut journal = Journal::new();
        let _ = journal.add_user("Test", Severity::Info, "test", serde_json::json!({}));
        journal.clear();
        assert!(journal.is_empty());
    }

    #[test]
    fn test_bounded() {
        let mut journal = Journal::new();
        for i in 0..600 {
            let _ = journal.add_user(
                format!("Test {}", i),
                Severity::Info,
                "test",
                serde_json::json!({}),
            );
        }
        assert!(journal.len() <= MAX_ENTRIES);
    }

    #[test]
    fn test_unread_count() {
        let mut journal = Journal::new();
        let _ = journal.add_user("Test1", Severity::Info, "test", serde_json::json!({}));
        let _ = journal.add_user("Test2", Severity::Info, "test", serde_json::json!({}));
        assert_eq!(journal.unread_count(Level::User), 2);
        journal.mark_read(&[1]);
        assert_eq!(journal.unread_count(Level::User), 1);
    }
}
