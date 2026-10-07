//! Шаблон загрузки и сохранения служебного состояния плагина.
//!
//! Состояние сериализуется целиком по ключу через [`Host::state_read`] и
//! [`Host::state_write`]; отсутствие значения даёт значение по умолчанию, а
//! повреждённый JSON — ошибку.

use serde::de::DeserializeOwned;
use serde::Serialize;

use crate::host::Host;

/// Загрузка состояния по ключу.
///
/// Отсутствие значения даёт [`Default`], поэтому пустое состояние плагина не
/// требует отдельной ветки.
pub fn load<T: DeserializeOwned + Default>(host: &impl Host, key: &str) -> Result<T, String> {
    let Some(value) = host.state_read(key)? else {
        return Ok(T::default());
    };
    serde_json::from_str(&value).map_err(|error| error.to_string())
}

/// Сохранение состояния по ключу.
pub fn save<T: Serialize>(host: &impl Host, key: &str, value: &T) -> Result<(), String> {
    let serialized = serde_json::to_string(value).map_err(|error| error.to_string())?;
    host.state_write(key, &serialized)
}
