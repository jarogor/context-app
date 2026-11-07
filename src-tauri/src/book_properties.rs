//! Пользовательские свойства книг: правки и теги поверх источника.
//!
//! Свойства книги добывает источник, а пользовательское дополнение к ним
//! принадлежит приложению: правки не должны теряться при пересборке индекса и
//! при смене источника. Записи ключуются абсолютным путём книги — так же, как
//! заметки и кэш обложек.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::documents::{self, BOOK_PROPERTIES};

/// Имя файла правок в служебном каталоге приложения.
const FILE_NAME: &str = "book-properties.json";

/// Правка свойств одной книги.
///
/// Отсутствующее поле означает «как в файле»: приложение не хранит копию
/// источника, только отличие от него.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BookPropertyEntry {
    /// Название, заданное пользователем.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    /// Авторы, заданные пользователем.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub authors: Vec<String>,
    /// Язык книги.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Дата выхода.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub published: Option<String>,
    /// Издатель.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub publisher: Option<String>,
    /// Идентификатор издания.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub identifier: Option<String>,
    /// Пользовательские теги книги.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub tags: Vec<String>,
    /// Когда правка сделана (Unix, мс).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at_millis: Option<i64>,
}

impl BookPropertyEntry {
    /// Пуста ли правка: хранить нечего.
    ///
    /// Время правки не считается содержимым: запись без свойств удаляется.
    pub fn is_empty(&self) -> bool {
        self.title.is_none()
            && self.authors.is_empty()
            && self.language.is_none()
            && self.published.is_none()
            && self.publisher.is_none()
            && self.identifier.is_none()
            && self.tags.is_empty()
    }
}

/// Правки свойств всех книг: абсолютный путь книги → правка.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BookProperties {
    /// Правки по абсолютному пути книги.
    #[serde(default)]
    pub books: BTreeMap<String, BookPropertyEntry>,
}

impl BookProperties {
    /// Загрузка из служебного каталога; отсутствие файла даёт пустой набор.
    pub fn load(root: &Path) -> Self {
        documents::read_or_default(&file_path(root), &BOOK_PROPERTIES).unwrap_or_default()
    }

    /// Сохранение атомарной записью; документ проверяется схемой.
    pub fn save(&self, root: &Path) -> Result<(), String> {
        documents::write(&file_path(root), &BOOK_PROPERTIES, self)
    }

    /// Правка книги по пути.
    pub fn entry(&self, path: &str) -> Option<&BookPropertyEntry> {
        self.books.get(path)
    }

    /// Запись правки; пустая правка удаляет запись.
    ///
    /// Так «вернуть как в файле» не оставляет в документе пустых записей.
    pub fn set(&mut self, path: &str, entry: BookPropertyEntry) {
        if entry.is_empty() {
            self.books.remove(path);
        } else {
            self.books.insert(path.to_string(), entry);
        }
    }
}

/// Путь файла правок в служебном каталоге приложения.
fn file_path(root: &Path) -> PathBuf {
    root.join(FILE_NAME)
}

#[cfg(test)]
#[path = "book_properties_tests.rs"]
mod tests;
