//! Разбор EPUB внутри WASM без доступа к операционной системе.
//!
//! Модуль не зависит от целевой архитектуры: используется как в WASM-точке
//! входа, так и в нативных тестах. Разделён по ответственностям: низкоуровневый
//! доступ к архиву и OPF (`archive`), извлечение глав для чтения (`chapters`),
//! метаданные и текст (`metadata`, `text`).

mod archive;
mod chapters;
mod metadata;
mod text;

pub use chapters::{read_epub_chapters, EpubChapter};
pub use metadata::{extract, parse_epub_metadata};
pub use text::read_epub_text;

#[cfg(test)]
#[path = "epub_tests.rs"]
mod tests;
