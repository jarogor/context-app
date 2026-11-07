//! Операции изменения состояния базового плагина заметок.
//!
//! Методы [`NotesState`] для переименования и удаления наборов, а также
//! добавления, изменения и удаления заметок. Хранение и чтение модели — в
//! [`crate::store`].

use crate::models::{
    normalize_color, normalize_shape, normalize_type, Note, NoteInput, NotePatch, NoteSet,
    PortableSet,
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

    /// Импорт набора из переносимого документа.
    ///
    /// Идентификаторы набора и заметок выдаёт вызывающая сторона: файл мог быть
    /// выгружен из этого же хранилища, и его идентификаторы уже заняты. Набор
    /// принимается **в любом случае**: если книга ещё не известна, он остаётся
    /// без книги (`book_key` пуст), а `book_title` служит подсказкой, какую книгу
    /// указать. Времена берутся из документа, а отсутствующие заменяются
    /// временем импорта.
    pub fn import_set(
        &mut self,
        document: PortableSet,
        book_key: &str,
        book_title: &str,
        set_id: &str,
        note_ids: &[String],
        now_millis: i64,
    ) -> Result<NoteSet, String> {
        let name = document.name.trim();
        if name.is_empty() {
            return Err("в файле нет имени набора заметок".to_string());
        }
        let set = NoteSet {
            id: set_id.to_string(),
            book_key: book_key.trim().to_string(),
            book_title: book_title.trim().to_string(),
            name: name.to_string(),
            created_at_millis: positive_or(document.created_at_millis, now_millis),
            notes: import_notes(document.notes, note_ids, now_millis),
        };
        self.sets.push(set.clone());
        Ok(set)
    }

    /// Привязка существующего набора к книге.
    ///
    /// Книга задаётся локальным ключом: набор мог быть принят без книги и потом
    /// связан с любой книгой этого хранилища — из библиотеки или открытой файлом.
    pub fn bind_set(
        &mut self,
        set_id: &str,
        book_key: &str,
        book_title: &str,
    ) -> Result<NoteSet, String> {
        let book_key = book_key.trim();
        if book_key.is_empty() {
            return Err("не указана книга для набора заметок".to_string());
        }
        let set = self
            .sets
            .iter_mut()
            .find(|set| set.id == set_id)
            .ok_or_else(|| format!("неизвестный набор заметок: {set_id}"))?;
        set.book_key = book_key.to_string();
        set.book_title = book_title.trim().to_string();
        Ok(set.clone())
    }
}

/// Заметки импортируемого набора с новыми идентификаторами.
///
/// Заметки без своего места в списке выданных идентификаторов отбрасываются:
/// вызывающая сторона выдаёт по идентификатору на каждую заметку файла.
fn import_notes(notes: Vec<Note>, note_ids: &[String], now_millis: i64) -> Vec<Note> {
    notes
        .into_iter()
        .zip(note_ids.iter())
        .map(|(note, id)| {
            let created = positive_or(note.created_at_millis, now_millis);
            Note {
                id: id.clone(),
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
                created_at_millis: created,
                updated_at_millis: positive_or(note.updated_at_millis, created),
            }
        })
        .collect()
}

/// Положительное время или замена: ноль и отрицательное значение — «не задано».
fn positive_or(value: i64, fallback: i64) -> i64 {
    if value > 0 {
        value
    } else {
        fallback
    }
}
