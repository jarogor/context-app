//! Описание служебного документа: метка, версии, схемы и владелец.
//!
//! Здесь только данные: чтение, приведение версий и запись — в
//! [`crate::documents::store`], проверка схемы — в [`crate::documents::schema`].

use serde_json::Value;

/// Владелец формата документа.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    /// Документ ядра: и форма, и запись принадлежат приложению.
    Core,
    /// Документ каркаса: манифесты плагинов.
    Framework,
    /// Документ прикладного плагина: форма принадлежит плагину.
    Plugin,
    /// Документ внешнего источника: формат задаёт издатель (индекс обновлений).
    External,
}

impl Owner {
    /// Строковое имя владельца для сообщений и тестов.
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Core => "core",
            Self::Framework => "framework",
            Self::Plugin => "plugin",
            Self::External => "external",
        }
    }
}

/// Приведение документа версии к следующей: меняет значение на месте.
pub type Upgrade = fn(&mut Value) -> Result<(), String>;

/// Версия формата документа: её схема и приведение к следующей версии.
#[derive(Debug, Clone, Copy)]
pub struct DocumentVersion {
    /// Номер версии формата (совпадает с каталогом `schemas/v<N>/`).
    pub version: u32,
    /// Текст схемы этой версии, встроенный в двоичный файл.
    pub schema: &'static str,
    /// Приведение документа этой версии к следующей.
    ///
    /// `None` у текущей версии: приводить некуда. Функция меняет значение на
    /// месте и возвращает отказ, если документ прежней версии не приводится.
    pub upgrade: Option<Upgrade>,
}

impl DocumentVersion {
    /// Версия документа и схема без приведения: для единственной версии.
    pub const fn only(version: u32, schema: &'static str) -> Self {
        Self {
            version,
            schema,
            upgrade: None,
        }
    }
}

/// Служебный документ приложения: как он опознаётся и чем проверяется.
#[derive(Debug, Clone, Copy)]
pub struct DocumentKind {
    /// Имя поля-метки в документе: `format` или `contract_version`.
    ///
    /// Метка `format` — строковый идентификатор вида документа; у манифестов и
    /// индексов обновлений роль метки играет номер контракта.
    pub format: &'static str,
    /// Имя схемы без расширения (`schemas/v<N>/<имя>.schema.json`).
    pub schema_name: &'static str,
    /// Владелец формата.
    pub owner: Owner,
    /// Версии формата от первой к текущей.
    ///
    /// Порядок обязателен: чтение идёт по цепочке приведений `upgrade` из
    /// версии документа к текущей. Старые версии из списка не удаляются, пока
    /// читаются старые документы.
    pub versions: &'static [DocumentVersion],
}

impl DocumentKind {
    /// Текущая версия формата.
    pub fn current_version(&self) -> u32 {
        self.versions
            .last()
            .map(|version| version.version)
            .unwrap_or_default()
    }

    /// Схема текущей версии.
    pub fn current_schema(&self) -> &'static str {
        self.versions
            .last()
            .map(|version| version.schema)
            .unwrap_or("{}")
    }

    /// Место версии в цепочке.
    pub fn position(&self, version: u32) -> Option<usize> {
        self.versions
            .iter()
            .position(|item| item.version == version)
    }

    /// Первая версия формата: так читается документ без метки и версии.
    pub fn first(&self) -> &'static DocumentVersion {
        &self.versions[0]
    }

    /// Поле-метка с номером контракта, а не со строковым идентификатором.
    pub fn is_contract(&self) -> bool {
        self.format == "contract_version"
    }

    /// Метка формата, которую документ обязан нести.
    ///
    /// Для документов с номером контракта отдельной строковой метки нет:
    /// опознание идёт по имени файла, а версию несёт `contract_version`.
    pub fn marker(&self) -> Option<&'static str> {
        if self.is_contract() {
            None
        } else {
            Some(self.format)
        }
    }
}
