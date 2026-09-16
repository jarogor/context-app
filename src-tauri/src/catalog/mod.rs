//! Каталог библиотеки: схема базы данных, миграции и доступ к записям.

pub mod entities;
pub mod error;
pub mod repository;
pub mod schema;

use std::path::Path;

use rusqlite::Connection;

use crate::library::LibraryError;

use self::schema::migrate;

pub use entities::*;
pub use error::CatalogError;

/// Подключение каталога к базе данных библиотеки с применением миграций.
///
/// Работает с любым соединением `rusqlite`; миграции выполняются
/// идемпотентно через таблицу `schema_version`.
pub fn open_catalog(connection: &mut Connection) -> Result<(), LibraryError> {
    migrate(connection)?;
    Ok(())
}

/// Открытие каталога по пути к файлу базы данных (для тестов).
pub fn open_catalog_at(path: &Path) -> Result<Connection, LibraryError> {
    let mut connection = Connection::open(path)?;
    open_catalog(&mut connection)?;
    Ok(connection)
}
