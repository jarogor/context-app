//! Разбор FB2: реэкспорт общего модуля `format-parsers::fb2`.
//!
//! Плагин получает метаданные и главы книги; общий модуль отвечает за разбор
//! XML, сносок и изображений.

pub use format_parsers::fb2::*;

use crate::Chapter;

/// Главы книги в модели плагина формата.
pub fn chapters(bytes: &[u8]) -> Result<Vec<Chapter>, String> {
    format_parsers::fb2::read_fb2_chapters(bytes).map(|chapters| {
        chapters
            .into_iter()
            .map(|chapter| Chapter {
                title: chapter.title,
                html: chapter.html,
            })
            .collect()
    })
}
