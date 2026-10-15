//! Извлечение простого текста XHTML-глав EPUB.

use std::io::Cursor;

use zip::ZipArchive;

use crate::xml::strip_markup;

/// Извлечение текста XHTML-глав из EPUB.
pub fn read_epub_text(bytes: &[u8]) -> Result<String, String> {
    let mut archive =
        ZipArchive::new(Cursor::new(bytes)).map_err(|_| "не удалось открыть EPUB".to_string())?;
    let mut chapters = Vec::new();
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|_| "не удалось прочитать EPUB".to_string())?;
        let name = file.name().to_ascii_lowercase();
        if !(name.ends_with(".xhtml") || name.ends_with(".html") || name.ends_with(".htm")) {
            continue;
        }
        let mut content = String::new();
        use std::io::Read;
        file.read_to_string(&mut content)
            .map_err(|_| "глава EPUB не является текстом".to_string())?;
        chapters.push(strip_markup(&content));
    }
    Ok(chapters.join("\n\n"))
}
