//! Состояние базового плагина заметок.
//!
//! Хранит наборы заметок и их заметки. Состояние сериализуется целиком в
//! служебное состояние плагина, поэтому наборы переживают перезапуск приложения.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::models::{normalize_color, normalize_shape, normalize_type, Note, NoteSet};

/// Типы операций, используемые тестами состояния через `use super::*`.
#[cfg(test)]
use crate::models::{NoteInput, NotePatch};

mod operations;

/// Текущая версия формата состояния.
pub(crate) const STATE_VERSION: u32 = 1;

/// Состояние заметок: версия формата, наборы и активный набор по книгам.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct NotesState {
    /// Версия формата состояния.
    #[serde(default)]
    version: u32,
    /// Наборы заметок.
    #[serde(default)]
    sets: Vec<NoteSet>,
    /// Активный набор по ключу книги: ключ книги → идентификатор набора.
    #[serde(default)]
    active: BTreeMap<String, String>,
    /// Признак, что состояние уже нормализовано и повторная проверка не нужна.
    #[serde(skip)]
    normalized: bool,
}

impl NotesState {
    /// Создание пустого состояния.
    pub fn new() -> Self {
        Self {
            version: STATE_VERSION,
            sets: Vec::new(),
            active: BTreeMap::new(),
            normalized: false,
        }
    }

    /// Приведение загруженного состояния к безопасной модели.
    ///
    /// Отбрасывает наборы и заметки без идентификатора, обрезает ключ книги и
    /// имя набора и нормализует долю позиции, чтобы повреждённые данные не
    /// ломали операции. Активный набор сохраняется, только если он указывает на
    /// существующий набор своей книги. Повторный вызов не сканирует состояние
    /// заново.
    pub fn normalized(mut self) -> Self {
        if self.normalized {
            return self;
        }
        if self.version == 0 {
            self.version = STATE_VERSION;
        }
        self.sets = self.sets.into_iter().filter_map(normalize_set).collect();
        // Идентификаторы существующих наборов для линейной проверки активных.
        let existing: BTreeMap<&str, &str> = self
            .sets
            .iter()
            .map(|set| (set.id.as_str(), set.book_key.as_str()))
            .collect();
        self.active = self
            .active
            .into_iter()
            .filter_map(|(book_key, set_id)| {
                let book_key = book_key.trim().to_string();
                let set_id = set_id.trim().to_string();
                if book_key.is_empty() || set_id.is_empty() {
                    return None;
                }
                let matches = existing
                    .get(set_id.as_str())
                    .is_some_and(|owner| *owner == book_key);
                matches.then_some((book_key, set_id))
            })
            .collect();
        self.normalized = true;
        self
    }

    /// Наборы заметок.
    #[cfg(test)]
    pub(crate) fn sets(&self) -> &[NoteSet] {
        &self.sets
    }

    /// Версия формата состояния.
    #[cfg(test)]
    pub(crate) fn version(&self) -> u32 {
        self.version
    }

    /// Наборы указанной книги с идентификатором, именем и числом заметок.
    pub fn list_for_book(&self, book_key: &str) -> Vec<serde_json::Value> {
        self.sets
            .iter()
            .filter(|set| set.book_key == book_key)
            .map(|set| {
                serde_json::json!({
                    "id": set.id,
                    "book_key": set.book_key,
                    "book_title": set.book_title,
                    "name": set.name,
                    "created_at_millis": set.created_at_millis,
                    "note_count": set.notes.len(),
                })
            })
            .collect()
    }

    /// Все наборы всех книг вместе с их заметками.
    ///
    /// Агрегат для реестра заметок: отдаёт наборы целиком (с ключом и
    /// отображаемым именем книги), чтобы реестр и поиск не делали запрос по
    /// каждой книге отдельно. Порядок — порядок хранения наборов.
    pub fn list_all(&self) -> &[NoteSet] {
        &self.sets
    }

    /// Активный набор книги или None, если выбор не сохранён.
    pub fn active_for_book(&self, book_key: &str) -> Option<&str> {
        self.active.get(book_key).map(String::as_str)
    }

    /// Запоминание активного набора книги.
    ///
    /// Отклоняется, если набор не существует или принадлежит другой книге.
    pub fn set_active(&mut self, book_key: &str, set_id: &str) -> Result<(), String> {
        let belongs = self
            .sets
            .iter()
            .any(|set| set.id == set_id && set.book_key == book_key);
        if !belongs {
            return Err(format!("набор {set_id} не принадлежит книге {book_key}"));
        }
        self.active.insert(book_key.to_string(), set_id.to_string());
        Ok(())
    }

    /// Набор по идентификатору.
    pub fn find(&self, set_id: &str) -> Option<&NoteSet> {
        self.sets.iter().find(|set| set.id == set_id)
    }
}

/// Приведение набора к безопасной модели; набор без идентификатора отбрасывается.
fn normalize_set(set: NoteSet) -> Option<NoteSet> {
    let id = set.id.trim().to_string();
    if id.is_empty() {
        return None;
    }
    let notes = set.notes.into_iter().filter_map(normalize_note).collect();
    Some(NoteSet {
        id,
        book_key: set.book_key.trim().to_string(),
        book_title: set.book_title.trim().to_string(),
        name: set.name.trim().to_string(),
        created_at_millis: set.created_at_millis.max(0),
        notes,
    })
}

/// Приведение заметки к безопасной модели; заметка без идентификатора отбрасывается.
fn normalize_note(note: Note) -> Option<Note> {
    let id = note.id.trim().to_string();
    if id.is_empty() {
        return None;
    }
    Some(Note {
        id,
        note_type: normalize_type(&note.note_type),
        anchor: note.anchor,
        quote: note.quote,
        chapter: note.chapter,
        title: note.title,
        comment: note.comment,
        color: normalize_color(&note.color),
        percent: note.percent.filter(|value| value.is_finite()),
        page: note.page,
        text: note.text,
        shape: normalize_shape(&note.shape),
        geometry: note.geometry,
        created_at_millis: note.created_at_millis.max(0),
        updated_at_millis: note.updated_at_millis.max(0),
    })
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
