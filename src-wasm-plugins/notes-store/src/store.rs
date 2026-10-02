//! Состояние базового плагина заметок.
//!
//! Хранит наборы заметок и их заметки. Состояние сериализуется целиком в
//! служебное состояние плагина, поэтому наборы переживают перезапуск приложения.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

use crate::models::{Note, NoteInput, NotePatch, NoteSet};

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
}

impl NotesState {
    /// Создание пустого состояния.
    pub fn new() -> Self {
        Self {
            version: STATE_VERSION,
            sets: Vec::new(),
            active: BTreeMap::new(),
        }
    }

    /// Приведение загруженного состояния к безопасной модели.
    ///
    /// Отбрасывает наборы и заметки без идентификатора, обрезает ключ книги и
    /// имя набора и нормализует долю позиции, чтобы повреждённые данные не
    /// ломали операции. Активный набор сохраняется, только если он указывает на
    /// существующий набор своей книги.
    pub fn normalized(mut self) -> Self {
        if self.version == 0 {
            self.version = STATE_VERSION;
        }
        self.sets = self.sets.into_iter().filter_map(normalize_set).collect();
        self.active = self
            .active
            .into_iter()
            .filter_map(|(book_key, set_id)| {
                let book_key = book_key.trim().to_string();
                let set_id = set_id.trim().to_string();
                if book_key.is_empty() || set_id.is_empty() {
                    return None;
                }
                let matches = self
                    .sets
                    .iter()
                    .any(|set| set.id == set_id && set.book_key == book_key);
                matches.then_some((book_key, set_id))
            })
            .collect();
        self
    }

    /// Наборы заметок.
    pub fn sets(&self) -> &[NoteSet] {
        &self.sets
    }

    /// Версия формата состояния.
    pub fn version(&self) -> u32 {
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
                    "name": set.name,
                    "created_at_millis": set.created_at_millis,
                    "note_count": set.notes.len(),
                })
            })
            .collect()
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

    /// Создание набора для книги с заданными идентификатором и временем.
    pub fn create_set(
        &mut self,
        book_key: &str,
        name: &str,
        id: &str,
        created_at_millis: i64,
    ) -> Result<NoteSet, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("имя набора не может быть пустым".to_string());
        }
        let set = NoteSet {
            id: id.to_string(),
            book_key: book_key.to_string(),
            name: name.to_string(),
            created_at_millis,
            notes: Vec::new(),
        };
        self.sets.push(set.clone());
        // Новый набор становится активным выбором книги.
        self.active.insert(book_key.to_string(), id.to_string());
        Ok(set)
    }

    /// Переименование набора; пустое имя отклоняется.
    pub fn rename_set(&mut self, set_id: &str, name: &str) -> Result<NoteSet, String> {
        let name = name.trim();
        if name.is_empty() {
            return Err("имя набора не может быть пустым".to_string());
        }
        let set = self
            .sets
            .iter_mut()
            .find(|set| set.id == set_id)
            .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
        set.name = name.to_string();
        Ok(set.clone())
    }

    /// Удаление набора вместе с его заметками.
    pub fn delete_set(&mut self, set_id: &str) -> Result<(), String> {
        let index = self
            .sets
            .iter()
            .position(|set| set.id == set_id)
            .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
        let removed = self.sets.remove(index);
        // Если удалён активный набор книги, выбор сбрасывается: следующий
        // активный определит вызывающая сторона.
        if self.active.get(&removed.book_key).map(String::as_str) == Some(set_id) {
            self.active.remove(&removed.book_key);
        }
        Ok(())
    }

    /// Добавление заметки в набор с заданными идентификатором и временем.
    pub fn add_note(
        &mut self,
        set_id: &str,
        input: NoteInput,
        id: &str,
        now_millis: i64,
    ) -> Result<Note, String> {
        let set = self
            .sets
            .iter_mut()
            .find(|set| set.id == set_id)
            .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
        let note = Note {
            id: id.to_string(),
            anchor: input.anchor,
            quote: input.quote,
            chapter: input.chapter,
            percent: input.percent,
            page: input.page,
            text: input.text,
            created_at_millis: now_millis,
            updated_at_millis: now_millis,
        };
        set.notes.push(note.clone());
        Ok(note)
    }

    /// Изменение заметки: заданные поля перекрывают текущие, время обновляется.
    pub fn update_note(
        &mut self,
        set_id: &str,
        note_id: &str,
        patch: NotePatch,
        now_millis: i64,
    ) -> Result<Note, String> {
        let set = self
            .sets
            .iter_mut()
            .find(|set| set.id == set_id)
            .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
        let note = set
            .notes
            .iter_mut()
            .find(|note| note.id == note_id)
            .ok_or_else(|| format!("неизвестная заметка: {note_id}"))?;
        if let Some(text) = patch.text {
            note.text = text;
        }
        if let Some(quote) = patch.quote {
            note.quote = quote;
        }
        if let Some(chapter) = patch.chapter {
            note.chapter = chapter;
        }
        if let Some(percent) = patch.percent {
            note.percent = Some(percent);
        }
        if let Some(page) = patch.page {
            note.page = Some(page);
        }
        note.updated_at_millis = now_millis;
        Ok(note.clone())
    }

    /// Удаление заметки из набора.
    pub fn delete_note(&mut self, set_id: &str, note_id: &str) -> Result<(), String> {
        let set = self
            .sets
            .iter_mut()
            .find(|set| set.id == set_id)
            .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
        let index = set
            .notes
            .iter()
            .position(|note| note.id == note_id)
            .ok_or_else(|| format!("неизвестная заметка: {note_id}"))?;
        set.notes.remove(index);
        Ok(())
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
        anchor: note.anchor,
        quote: note.quote,
        chapter: note.chapter,
        percent: note.percent.filter(|value| value.is_finite()),
        page: note.page,
        text: note.text,
        created_at_millis: note.created_at_millis.max(0),
        updated_at_millis: note.updated_at_millis.max(0),
    })
}

#[cfg(test)]
#[path = "store_tests.rs"]
mod tests;
