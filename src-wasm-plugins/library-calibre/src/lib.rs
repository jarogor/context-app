//! Source-плагин библиотеки Calibre для приложения «Текстура».
//!
//! Читает раскладку «<автор>/<книга>», уточняет метаданные из EPUB/OPF и
//! владеет виртуальным каталогом библиотеки. Файлы библиотеки не изменяются.

pub(crate) mod epub;
pub(crate) mod fs;
pub(crate) mod index;
pub(crate) mod lifecycle;
pub(crate) mod migrations;
pub(crate) mod models;
pub(crate) mod opf;
pub(crate) mod scanner;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(test)]
mod test_fs;
#[cfg(test)]
mod test_sql;
