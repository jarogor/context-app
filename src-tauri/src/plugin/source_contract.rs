//! Совместимость протокола source-плагина.
//!
//! Каталог — непрозрачные данные плагина, но номер протокола — часть
//! контракта: каталог, созданный более новой версией, приложение не читает,
//! иначе незнакомые поля и формы молча превращались бы в мусор в интерфейсе.

use serde_json::Value;

/// Наибольшая поддерживаемая версия протокола каталога.
pub const SUPPORTED_SOURCE_PROTOCOL: u32 = 2;

/// Проверка версии протокола в ответе открытия каталога.
///
/// Ответ без номера версии считается первой версией: так читаются прежние
/// источники. Отсутствие каталога в ответе — не ошибка: операцию мог обработать
/// плагин, который каталог не отдаёт.
pub fn ensure_supported(open_response: &str) -> Result<(), String> {
    let value: Value = serde_json::from_str(open_response)
        .map_err(|error| format!("не удалось прочитать ответ каталога: {error}"))?;
    let version = value
        .get("catalog")
        .and_then(|catalog| catalog.get("protocol_version"))
        .and_then(Value::as_u64)
        .unwrap_or(1) as u32;
    if version > SUPPORTED_SOURCE_PROTOCOL {
        return Err(format!(
            "каталог создан более новой версией приложения (протокол {version}, поддерживается {SUPPORTED_SOURCE_PROTOCOL})"
        ));
    }
    Ok(())
}

#[cfg(test)]
#[path = "source_contract_tests.rs"]
mod tests;
