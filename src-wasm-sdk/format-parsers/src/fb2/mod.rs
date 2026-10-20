//! Разбор FB2 внутри WASM без доступа к операционной системе.
//!
//! Модуль не зависит от целевой архитектуры: используется как в WASM-точке
//! входа, так и в нативных тестах. FB2 — это XML-документ, поэтому главы
//! строятся обходом дерева: разделы становятся главами, а теги книги —
//! безопасным HTML.
//!
//! Состав: определение кодировки (`decode`), сборка глав (`mod`) и
//! преобразование разметки (`html`).

mod decode;
mod html;

use roxmltree::{Document, Node};
use serde::Serialize;

/// Глава FB2 для рабочей страницы чтения.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Fb2Chapter {
    /// Заголовок главы, если найден.
    pub title: Option<String>,
    /// Внутренний HTML главы с изображениями в data-URI.
    pub html: String,
}

/// Извлечение глав FB2 в порядке следования книги.
///
/// Основное тело книги делится на главы по верхнеуровневым секциям. Тело
/// сносок добавляется последней главой, поэтому внутренние ссылки `#id`
/// работают в общем документе чтения. Изображения из `<binary>` встраиваются
/// как `data:`-URI. При отсутствии секций тело показывается одной главой.
pub fn read_fb2_chapters(bytes: &[u8]) -> Result<Vec<Fb2Chapter>, String> {
    let source = decode::decode(bytes);
    let document = Document::parse(&source).map_err(|_| "не удалось разобрать FB2".to_string())?;
    let root = document.root_element();
    if root.tag_name().name() != "FictionBook" {
        return Err("файл не является FB2".to_string());
    }
    let binaries = html::binaries(root);
    let mut chapters = Vec::new();
    let mut main_body = None;
    let mut notes_body = None;
    for body in root.children().filter(|node| node.is_element()) {
        if body.tag_name().name() != "body" {
            continue;
        }
        if attribute(body, "name") == Some("notes") {
            notes_body = Some(body);
        } else if main_body.is_none() {
            main_body = Some(body);
        }
    }
    let Some(main_body) = main_body else {
        return Err("в FB2 нет тела книги".to_string());
    };
    chapters.extend(body_chapters(main_body, &binaries));
    if let Some(notes_body) = notes_body {
        let html = html::render_children(notes_body, &binaries);
        if !html.trim().is_empty() {
            chapters.push(Fb2Chapter {
                title: Some("Сноски".to_string()),
                html: format!(r#"<div class="fb2-notes">{html}</div>"#),
            });
        }
    }
    chapters.retain(|chapter| !chapter.html.trim().is_empty());
    if chapters.is_empty() {
        return Err("в FB2 нет читаемых глав".to_string());
    }
    Ok(chapters)
}

/// Главы из тела книги: верхнеуровневые секции либо всё тело одной главой.
fn body_chapters(body: Node<'_, '_>, binaries: &html::Binaries) -> Vec<Fb2Chapter> {
    let sections = body
        .children()
        .filter(|node| node.is_element() && node.tag_name().name() == "section")
        .collect::<Vec<_>>();
    if sections.is_empty() {
        let html = html::render_children(body, binaries);
        if html.trim().is_empty() {
            return Vec::new();
        }
        return vec![Fb2Chapter {
            title: html::title_of(body),
            html,
        }];
    }
    sections
        .into_iter()
        .map(|section| Fb2Chapter {
            title: html::title_of(section),
            html: html::render_section(section, binaries),
        })
        .collect()
}

/// Значение атрибута без учёта пространства имён (`l:href` → `href`).
pub(crate) fn attribute<'a>(node: Node<'a, 'a>, name: &str) -> Option<&'a str> {
    node.attributes()
        .find(|attribute| attribute.name() == name)
        .map(|attribute| attribute.value())
}

#[cfg(test)]
#[path = "fb2_tests.rs"]
mod tests;
