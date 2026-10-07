//! Реестр секций настроек.
//!
//! Строит плоский список зарегистрированных секций из деклараций владельцев
//! и проверяет уникальность полных идентификаторов.

use crate::models::{RegisteredSection, Source};

/// Упорядоченный реестр зарегистрированных секций.
#[derive(Debug, Clone, Default)]
pub struct Registry {
    /// Секции в порядке объявления владельцами.
    sections: Vec<RegisteredSection>,
}

impl Registry {
    /// Построение реестра из деклараций владельцев.
    ///
    /// Полный идентификатор секции имеет вид `<owner>.<section.id>` и должен
    /// быть уникальным. При конфликте возвращается ошибка, а реестр не
    /// создаётся, поэтому частично применённое состояние невозможно.
    pub fn from_sources(sources: &[Source]) -> Result<Self, String> {
        let mut sections: Vec<RegisteredSection> = Vec::new();
        for source in sources {
            if source.owner.trim().is_empty() {
                return Err("имя владельца секций не может быть пустым".to_string());
            }
            for section in &source.schema.sections {
                if section.id.trim().is_empty() {
                    return Err(format!(
                        "секция владельца {} не имеет идентификатора",
                        source.owner
                    ));
                }
                let id = format!("{}.{}", source.owner, section.id);
                if sections.iter().any(|registered| registered.id == id) {
                    return Err(format!("дублирующийся идентификатор секции настроек: {id}"));
                }
                sections.push(RegisteredSection {
                    id,
                    owner: source.owner.clone(),
                    kind: source.kind.clone(),
                    title: section.title.clone(),
                    description: section.description.clone(),
                    fields: section.fields.clone(),
                });
            }
        }
        Ok(Self { sections })
    }

    /// Секции реестра.
    pub fn sections(&self) -> &[RegisteredSection] {
        &self.sections
    }

    /// Поиск секции по полному идентификатору.
    #[cfg(test)]
    pub(crate) fn find(&self, id: &str) -> Option<&RegisteredSection> {
        self.sections.iter().find(|section| section.id == id)
    }
}

#[cfg(test)]
#[path = "registry_tests.rs"]
mod tests;
