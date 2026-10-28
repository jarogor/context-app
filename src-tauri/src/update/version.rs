//! Сравнение версий и определение ключа платформы.

use semver::Version;

/// Ключ текущей платформы в формате `ОС-архитектура`.
///
/// Совпадает с именами платформ в индексе обновлений и с ключами, которые
/// использует Tauri: `linux-x86_64`, `darwin-aarch64`, `windows-x86_64`.
pub fn platform_key() -> String {
    format!("{}-{}", os_name(), arch_name())
}

/// Имя операционной системы для ключа платформы.
fn os_name() -> &'static str {
    match std::env::consts::OS {
        "macos" => "darwin",
        other => other,
    }
}

/// Имя архитектуры для ключа платформы.
fn arch_name() -> &'static str {
    match std::env::consts::ARCH {
        "x86" => "i686",
        "arm" => "armv7",
        other => other,
    }
}

/// Проверка, что предлагаемая версия новее текущей.
pub fn is_newer(current: &str, candidate: &str) -> Result<bool, String> {
    let current = parse(current)?;
    let candidate = parse(candidate)?;
    Ok(candidate > current)
}

/// Разбор версии с понятной ошибкой.
pub fn parse(value: &str) -> Result<Version, String> {
    let normalized = value.trim().trim_start_matches('v');
    Version::parse(normalized).map_err(|error| format!("некорректная версия {value}: {error}"))
}

#[cfg(test)]
#[path = "version_tests.rs"]
mod tests;
