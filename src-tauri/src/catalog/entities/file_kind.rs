//! Тип файла, связанного с книгой.

/// Тип файла, связанного с книгой.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileKind {
    /// Файл содержимого книги.
    Book,
    /// Файл обложки.
    Cover,
}

impl FileKind {
    /// Строковое представление в схеме БД.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Book => "book",
            Self::Cover => "cover",
        }
    }
}

impl serde::Serialize for FileKind {
    /// Сериализация в строковое представление для API.
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.as_str())
    }
}
