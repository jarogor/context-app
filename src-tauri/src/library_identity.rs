//! Устойчивый идентификатор библиотеки.
//!
//! Индекс библиотеки хранится в служебном каталоге и должен переживать
//! переподключение носителя. Раньше ключом служил путь, поэтому одна и та же
//! библиотека на съёмном диске давала два индекса: диск монтировался то в
//! `/media/<пользователь>/<том>`, то в `/run/media/<пользователь>/<том>`.
//!
//! Здесь ключ строится по **идентичности носителя**, а путь остаётся запасным
//! вариантом: если том определить нельзя (сетевой ресурс, каталог на корневой
//! файловой системе), ключом становится канонический путь.

use std::path::{Path, PathBuf};

/// Идентификатор библиотеки: устойчивый признак тома или запасной путь.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LibraryIdentity {
    /// Носитель опознан по UUID файловой системы.
    Volume(String),
    /// Носитель не опознан: ключом служит канонический путь.
    Path(String),
}

impl LibraryIdentity {
    /// Строковый ключ для каталога служебного хранилища.
    ///
    /// Значение не содержит разделителей пути и годится как имя каталога.
    pub fn key(&self) -> String {
        match self {
            Self::Volume(uuid) => format!("volume-{}", sanitize(uuid)),
            Self::Path(path) => format!("path-{}", short_hash(path)),
        }
    }

    /// Путь библиотеки для сведений о индексе.
    pub fn describe(&self) -> String {
        match self {
            Self::Volume(uuid) => format!("volume:{uuid}"),
            Self::Path(path) => format!("path:{path}"),
        }
    }
}

/// Определение идентификатора библиотеки по её каталогу.
///
/// Путь канонизируется: символическая ссылка и `..` не должны давать новый
/// ключ. Если каталог на съёмном томе с UUID, ключ не зависит от точки
/// монтирования.
pub fn identify(root: &Path) -> LibraryIdentity {
    let canonical = root.canonicalize().unwrap_or_else(|_| root.to_path_buf());
    if let Some(uuid) = volume_uuid(&canonical) {
        return LibraryIdentity::Volume(uuid);
    }
    LibraryIdentity::Path(canonical.to_string_lossy().into_owned())
}

/// UUID файловой системы, на которой лежит каталог.
///
/// Опознание идёт через точку монтирования: в `/proc/self/mountinfo` берётся
/// самая длинная точка, содержащая каталог, затем её устройство ищется среди
/// ссылок `/dev/disk/by-uuid`. На других платформах и для неразмеченных
/// источников возвращается `None` — тогда работает запасной ключ по пути.
#[cfg(target_os = "linux")]
fn volume_uuid(canonical: &Path) -> Option<String> {
    let source = mount_source(canonical)?;
    if !source.starts_with("/dev/") {
        return None;
    }
    let entries = std::fs::read_dir("/dev/disk/by-uuid").ok()?;
    for entry in entries.flatten() {
        let link = entry.path();
        let target = std::fs::read_link(&link).ok()?;
        // Ссылка относительна каталогу by-uuid: `../../sdb1`.
        let resolved = link.parent()?.join(&target);
        let resolved = resolved.canonicalize().unwrap_or(resolved);
        let expected = Path::new(&source)
            .canonicalize()
            .unwrap_or_else(|_| PathBuf::from(&source));
        if resolved == expected {
            return Some(entry.file_name().to_string_lossy().into_owned());
        }
    }
    None
}

/// Носитель, на котором смонтирован каталог, по `/proc/self/mountinfo`.
#[cfg(target_os = "linux")]
fn mount_source(canonical: &Path) -> Option<String> {
    let contents = std::fs::read_to_string("/proc/self/mountinfo").ok()?;
    let mut best: Option<(usize, String)> = None;
    for line in contents.lines() {
        // Формат: id parent major:minor root mountpoint options … - fstype source …
        let Some((before, after)) = line.split_once(" - ") else {
            continue;
        };
        let fields: Vec<&str> = before.split(' ').collect();
        let Some(mountpoint) = fields.get(4) else {
            continue;
        };
        let mountpoint = unescape_mountinfo(mountpoint);
        if !canonical.starts_with(&mountpoint) {
            continue;
        }
        let mut rest = after.split(' ');
        let _fstype = rest.next();
        let Some(source) = rest.next() else {
            continue;
        };
        let depth = mountpoint.components().count();
        if best
            .as_ref()
            .map(|(current, _)| depth > *current)
            .unwrap_or(true)
        {
            best = Some((depth, source.to_string()));
        }
    }
    best.map(|(_, source)| source)
}

/// Раскрытие escape-последовательностей octal в `/proc/self/mountinfo`.
///
/// Ядро кодирует пробелы и служебные символы как `\040` и подобные: без
/// обратного преобразования путь с пробелом не совпадёт.
#[cfg(target_os = "linux")]
fn unescape_mountinfo(value: &str) -> PathBuf {
    let bytes = value.as_bytes();
    let mut result = String::with_capacity(value.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'\\' && index + 3 < bytes.len() {
            let digits = &value[index + 1..index + 4];
            if let Ok(code) = u8::from_str_radix(digits, 8) {
                result.push(code as char);
                index += 4;
                continue;
            }
        }
        result.push(bytes[index] as char);
        index += 1;
    }
    PathBuf::from(result)
}

/// Не-Linux платформы: опознание тома не выполняется.
#[cfg(not(target_os = "linux"))]
fn volume_uuid(_canonical: &Path) -> Option<String> {
    None
}

/// Очистка UUID до допустимых в имени каталога символов.
fn sanitize(value: &str) -> String {
    value
        .chars()
        .map(|character| {
            if character.is_ascii_alphanumeric() || character == '-' || character == '_' {
                character
            } else {
                '_'
            }
        })
        .collect()
}

/// Короткий хеш пути для запасного ключа.
fn short_hash(value: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
#[path = "library_identity_tests.rs"]
mod tests;
