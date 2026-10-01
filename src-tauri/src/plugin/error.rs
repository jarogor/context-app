//! Типы ошибок плагинной подсистемы.

use std::io;
use std::path::PathBuf;

/// Ошибка, возникающая при обнаружении или загрузке плагина.
#[derive(Debug)]
pub enum PluginError {
    /// Ошибка ввода-вывода при сканировании папки плагинов.
    Io(io::Error),
    /// Манифест отсутствует или не соответствует контракту.
    InvalidManifest { dir: PathBuf, reason: String },
    /// Версия контракта манифеста не поддерживается приложением.
    UnsupportedContract { dir: PathBuf, version: u32 },
    /// Модуль, указанный в манифесте, отсутствует.
    ModuleNotFound { dir: PathBuf, module: String },
    /// Модуль не удалось загрузить в Extism runtime.
    Build { dir: PathBuf, message: String },
    /// Плагин не экспортирует ожидаемую контрактом функцию.
    MissingExport { dir: PathBuf, function: String },
    /// Вызов функции плагина завершился ошибкой.
    Call { plugin: String, message: String },
    /// Плагин с указанным именем не загружен.
    UnknownPlugin(String),
    /// Ошибка работы с пакетом плагина.
    Package { reason: String },
    /// Ошибка доступа к файлу модуля рисования плагина рабочего места.
    ViewerResource { plugin: String, message: String },
    /// Ни один загруженный плагин не предоставляет требуемую capability.
    MissingCapability(String),
    /// Зависимость плагина не может быть разрешена.
    Dependency { plugin: String, capability: String },
    /// В графе зависимостей обнаружен цикл.
    DependencyCycle(String),
}

impl From<io::Error> for PluginError {
    /// Преобразование ошибки ввода-вывода в ошибку плагинной подсистемы.
    fn from(value: io::Error) -> Self {
        Self::Io(value)
    }
}

impl std::fmt::Display for PluginError {
    /// Форматирование ошибки для пользователя.
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(err) => write!(f, "ошибка ввода-вывода: {err}"),
            Self::InvalidManifest { dir, reason } => {
                write!(
                    f,
                    "некорректный манифест плагина в {}: {reason}",
                    dir.display()
                )
            }
            Self::UnsupportedContract { dir, version } => {
                write!(
                    f,
                    "неподдерживаемая версия контракта {} в плагине {}",
                    version,
                    dir.display()
                )
            }
            Self::ModuleNotFound { dir, module } => {
                write!(f, "модуль {module} не найден в {}", dir.display())
            }
            Self::Build { dir, message } => {
                write!(f, "ошибка загрузки плагина {}: {message}", dir.display())
            }
            Self::MissingExport { dir, function } => {
                write!(
                    f,
                    "плагин {} не экспортирует функцию {function}",
                    dir.display()
                )
            }
            Self::Call { plugin, message } => {
                write!(f, "вызов плагина {plugin} завершился ошибкой: {message}")
            }
            Self::UnknownPlugin(name) => write!(f, "плагин {name} не загружен"),
            Self::Package { reason } => write!(f, "ошибка пакета плагина: {reason}"),
            Self::ViewerResource { plugin, message } => {
                write!(f, "ошибка модуля рисования плагина {plugin}: {message}")
            }
            Self::MissingCapability(capability) => {
                write!(
                    f,
                    "capability {capability} не предоставлена ни одним плагином"
                )
            }
            Self::Dependency { plugin, capability } => write!(
                f,
                "плагин {plugin} требует недоступную capability {capability}"
            ),
            Self::DependencyCycle(plugin) => {
                write!(f, "обнаружен цикл зависимостей плагина {plugin}")
            }
        }
    }
}

impl std::error::Error for PluginError {
    /// Возврат исходной ошибки ввода-вывода.
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(err) => Some(err),
            _ => None,
        }
    }
}
