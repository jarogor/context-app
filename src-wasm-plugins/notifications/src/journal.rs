//! Журнал событий базового плагина уведомлений.
//!
//! Append-only журнал в памяти с ограничением размера, сериализуемый в
//! служебное состояние плагина.

use std::collections::VecDeque;

use serde::{Deserialize, Serialize};

use crate::models::{now_millis, Entry, Level, Severity};

/// Максимальное количество записей в журнале.
pub(crate) const MAX_ENTRIES: usize = 500;

/// Журнал событий.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Journal {
    /// Записи журнала.
    entries: VecDeque<Entry>,
    /// Идентификатор следующей записи.
    next_id: u64,
}

impl Journal {
    /// Создание пустого журнала.
    pub fn new() -> Self {
        Self::default()
    }

    /// Добавление события пользовательского уровня.
    pub fn add_user(
        &mut self,
        message: impl Into<String>,
        severity: Severity,
        source: impl Into<String>,
        details: serde_json::Value,
    ) -> Entry {
        self.add(Level::User, message, severity, source, details)
    }

    /// Добавление события технического уровня.
    pub fn add_technical(
        &mut self,
        message: impl Into<String>,
        source: impl Into<String>,
        details: serde_json::Value,
    ) -> Entry {
        self.add(Level::Technical, message, Severity::Info, source, details)
    }

    /// Добавление события в журнал.
    fn add(
        &mut self,
        level: Level,
        message: impl Into<String>,
        severity: Severity,
        source: impl Into<String>,
        details: serde_json::Value,
    ) -> Entry {
        let id = self.next_id;
        self.next_id += 1;
        let entry = Entry {
            id,
            timestamp: now_millis(),
            level,
            severity,
            message: message.into(),
            source: source.into(),
            details,
            read: false,
        };
        self.entries.push_back(entry.clone());
        if self.entries.len() > MAX_ENTRIES {
            self.entries.pop_front();
        }
        entry
    }

    /// Получение записей, при необходимости отфильтрованных по уровню.
    pub fn list(&self, level: Option<Level>) -> Vec<Entry> {
        self.entries
            .iter()
            .filter(|entry| match level {
                Some(value) => entry.level == value,
                None => true,
            })
            .cloned()
            .collect()
    }

    /// Пометка записей как прочитанных.
    pub fn mark_read(&mut self, ids: &[u64]) {
        for entry in &mut self.entries {
            if ids.contains(&entry.id) {
                entry.read = true;
            }
        }
    }

    /// Пометка всех записей как прочитанных.
    pub fn mark_all_read(&mut self) {
        for entry in &mut self.entries {
            entry.read = true;
        }
    }

    /// Очистка журнала.
    pub fn clear(&mut self) {
        self.entries.clear();
        self.next_id = 0;
    }

    /// Количество всех записей.
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// Проверка пустоты журнала.
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
#[path = "journal_tests.rs"]
mod tests;
