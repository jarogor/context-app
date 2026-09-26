//! Модели стора плагинов.

use serde::{Deserialize, Serialize};

/// Установленный плагин в представлении ядра.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Installed {
    /// Идентификатор плагина.
    pub id: String,
    /// Человекочитаемое имя плагина.
    pub name: String,
    /// Категория плагина.
    pub kind: String,
    /// Версия контракта плагина.
    pub contract_version: u32,
    /// Описание плагина.
    pub description: String,
}

/// Подключённый стор.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Store {
    /// Уникальный идентификатор стора.
    pub id: String,
    /// Вид провайдера: `file` или `network`.
    pub kind: String,
    /// Человекочитаемое название.
    pub title: String,
    /// Расположение: каталог для файлового стора, адрес для сетевого.
    #[serde(default)]
    pub location: String,
}

/// Пакет в индексе стора.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Package {
    /// Имя пакета (совпадает с именем плагина).
    pub name: String,
    /// Версия пакета.
    #[serde(default)]
    pub version: String,
    /// Категория плагина.
    #[serde(default)]
    pub kind: String,
    /// Описание пакета.
    #[serde(default)]
    pub description: String,
    /// Путь к zip-пакету относительно расположения стора.
    pub location: String,
    /// Контрольная сумма пакета (задел на проверку целостности).
    #[serde(default)]
    pub sha256: Option<String>,
}

/// Запись перечня отключаемых плагинов.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PluginEntry {
    /// Идентификатор плагина.
    pub id: String,
    /// Человекочитаемое имя плагина.
    pub name: String,
    /// Категория плагина.
    pub kind: String,
    /// Описание плагина.
    pub description: String,
    /// Включён ли плагин.
    pub enabled: bool,
    /// Можно ли удалить плагин.
    pub removable: bool,
}

/// Индекс пакетов файлового стора.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StoreIndex {
    /// Пакеты, предлагаемые стором.
    #[serde(default)]
    pub packages: Vec<Package>,
}

/// Состояние плагина: реестр подключённых сторов.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StoreState {
    /// Подключённые сторы.
    #[serde(default)]
    pub stores: Vec<Store>,
}
