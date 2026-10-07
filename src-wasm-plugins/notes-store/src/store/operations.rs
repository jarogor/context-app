//! Операции изменения состояния базового плагина заметок.
//!
//! Методы [`NotesState`] для переименования и удаления наборов, а также
//! добавления, изменения и удаления заметок. Хранение и чтение модели — в
//! [`crate::store`].

use crate::models::{
    normalize_color, normalize_shape, normalize_type, Note, NoteInput, NotePatch, NoteSet,
};
use crate::store::NotesState;

impl NotesState {
    /// Создание набора для книги с заданными идентификатором и временем.
    pub fn create_set(
        &mut self,
        book_key: &str,
        book_title: &str,
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
            book_title: book_title.trim().to_string(),
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
            note_type: normalize_type(input.note_type.as_deref().unwrap_or_default()),
            anchor: input.anchor,
            quote: input.quote,
            chapter: input.chapter,
            title: input.title,
            comment: input.comment,
            color: normalize_color(input.color.as_deref().unwrap_or_default()),
            percent: input.percent,
            page: input.page,
            text: input.text,
            shape: normalize_shape(input.shape.as_deref().unwrap_or_default()),
            geometry: input.geometry,
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
        if let Some(note_type) = patch.note_type {
            note.note_type = normalize_type(&note_type);
        }
        if let Some(text) = patch.text {
            note.text = text;
        }
        if let Some(quote) = patch.quote {
            note.quote = quote;
        }
        if let Some(anchor) = patch.anchor {
            note.anchor = anchor;
        }
        if let Some(chapter) = patch.chapter {
            note.chapter = chapter;
        }
        if let Some(title) = patch.title {
            note.title = title;
        }
        if let Some(comment) = patch.comment {
            note.comment = comment;
        }
        if let Some(color) = patch.color {
            note.color = normalize_color(&color);
        }
        if let Some(percent) = patch.percent {
            note.percent = Some(percent);
        }
        if let Some(page) = patch.page {
            note.page = Some(page);
        }
        if let Some(shape) = patch.shape {
            note.shape = normalize_shape(&shape);
        }
        if let Some(geometry) = patch.geometry {
            note.geometry = geometry;
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
