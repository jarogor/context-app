//! Модель каталога: доменные типы, связанные с базой данных.

pub mod author;
pub mod book;
pub mod book_file;
pub mod file_kind;
pub mod new_book;
pub mod series;
pub mod series_link;
pub mod tag;

pub use author::Author;
pub use book::Book;
pub use book_file::BookFile;
pub use file_kind::FileKind;
pub use new_book::{NewBook, NewFile};
pub use series::Series;
pub use series_link::SeriesLink;
pub use tag::Tag;
