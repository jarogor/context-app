//! Сведения о приложении для страницы «Обновления».
//!
//! Ядро владеет фактическими расположениями служебных каталогов и кешей и
//! отдаёт их интерфейсу одним снимком: без этого непонятно, где лежат плагины,
//! состояние и кеш. Версия приложения приходит из собранного пакета, остальное
//! вычисляется здесь. Список один: пользователю не показывают техническое
//! деление плагинов на уровни («каркас», «приложение») и «виды» — плагины есть
//! плагины.

use std::collections::HashSet;
use std::path::Path;

use serde::Serialize;

/// Описание одного служебного расположения для отображения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppPath {
    /// Машинный ключ расположения.
    pub key: String,
    /// Человекочитаемое название.
    pub title: String,
    /// Абсолютный путь к каталогу или файлу.
    pub path: String,
    /// Краткое пояснение назначения.
    pub note: String,
    /// Занятое место в байтах (`None` — размер не определён).
    ///
    /// Каталог считается целиком, файл — своим размером. Размер нужен рядом с
    /// путём: по нему видно, сколько место занимает состояние приложения и
    /// журнал, который отдаётся при обращении.
    pub size_bytes: Option<u64>,
}

/// Сведения о приложении: версия и служебные расположения.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AppInfo {
    /// Отображаемое название приложения.
    pub name: String,
    /// Версия приложения из пакета.
    pub version: String,
    /// Служебные каталоги и файлы состояния, конфигов и кешей.
    pub paths: Vec<AppPath>,
}

impl AppInfo {
    /// Сборка сведений из версии пакета и корня данных приложения.
    ///
    /// Пользователю показываются два файла: каталог данных с настройками и
    /// плагинами и журнал, который отдаётся при обращении. Внутреннее деление и
    /// жаргон («каркас», «уровень приложения», «в поставке») наружу не выносятся.
    pub fn build(name: impl Into<String>, version: impl Into<String>, data_root: &Path) -> Self {
        let path_of = |path: &Path| path.to_string_lossy().into_owned();
        let diagnostics_path = data_root
            .join(crate::constants::APP_STATE_DIR_NAME)
            .join(crate::plugin::diagnostics::DIAGNOSTICS_FILE_NAME);
        let paths = vec![
            AppPath {
                key: "app_data".to_string(),
                title: "app.settings.data.title".to_string(),
                size_bytes: directory_size(data_root),
                path: path_of(data_root),
                note: "app.settings.data.note".to_string(),
            },
            // Журнал — единственный файл, который пользователю нужно найти
            // самому, чтобы отдать при обращении.
            AppPath {
                key: "diagnostics".to_string(),
                title: "app.settings.logs.title".to_string(),
                size_bytes: file_size(&diagnostics_path),
                path: path_of(&diagnostics_path),
                note: String::new(),
            },
        ];
        Self {
            name: name.into(),
            version: version.into(),
            paths,
        }
    }

    /// Смена имени приложения на выбранный язык интерфейса.
    ///
    /// Имя — текст интерфейса: в русском «Контекст», в английском «Context».
    /// Ядро перевода не хранит, а принимает готовое имя от оболочки, которая
    /// знает активный язык; служебные расположения при этом не меняются.
    pub fn set_name(&mut self, name: impl Into<String>) {
        self.name = name.into();
    }
}

/// Суммарный размер каталога в байтах, включая вложенные каталоги.
///
/// Считается так же, как это принято утилитами учёта места (`du`): каждый файл
/// учитывается **один раз** по числу занятых блоков, а не по длине содержимого.
/// Это важно для каталога webview: кеш движка широко пользуется жёсткими
/// ссылками, и одни и те же блоки видны под десятками имён. Без учёта ссылок
/// и блоков размер выходил заметно больше реально занятого места.
///
/// Ошибки чтения отдельных записей пропускаются: размер нужен для справки, и
/// недоступный файл не должен скрывать остальные. Отсутствующий каталог даёт
/// `None` — размера у него нет.
fn directory_size(path: &Path) -> Option<u64> {
    if !path.is_dir() {
        return None;
    }
    let mut total = 0u64;
    let mut seen: HashSet<(u64, u64)> = HashSet::new();
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                stack.push(entry.path());
                continue;
            }
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if !count_entry(&meta, &mut seen) {
                continue;
            }
            total = total.saturating_add(allocated_bytes(&meta));
        }
    }
    Some(total)
}

/// Учёт файла в наборе уже посчитанных.
///
/// Возвращает `false`, если этот файл уже учтён: у жёсткой ссылки тот же inode
/// и то же устройство, а блоки у них общие. Устройство входит в ключ, потому
/// что номера inode уникальны только в пределах файловой системы.
#[cfg(unix)]
fn count_entry(meta: &std::fs::Metadata, seen: &mut HashSet<(u64, u64)>) -> bool {
    use std::os::unix::fs::MetadataExt;
    seen.insert((meta.dev(), meta.ino()))
}

/// Учёт файла вне Unix: жёсткие ссылки здесь не отслеживаются по inode.
#[cfg(not(unix))]
fn count_entry(_meta: &std::fs::Metadata, _seen: &mut HashSet<(u64, u64)>) -> bool {
    true
}

/// Место, занятое файлом на диске.
///
/// Берутся занятые блоки, а не длина: разреженные файлы и файлы с хвостом
/// последнего блока занимают не столько, сколько в них байтов. На Unix блоки
/// известны напрямую; на остальных платформах берётся длина — точного счётчика
/// занятых блоков в стандартной библиотеке нет.
#[cfg(unix)]
fn allocated_bytes(meta: &std::fs::Metadata) -> u64 {
    use std::os::unix::fs::MetadataExt;
    meta.blocks().saturating_mul(512)
}

/// Место, занятое файлом вне Unix: длина файла.
#[cfg(not(unix))]
fn allocated_bytes(meta: &std::fs::Metadata) -> u64 {
    meta.len()
}

/// Размер файла в байтах; отсутствующий файл даёт `None`.
fn file_size(path: &Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|meta| meta.len())
}

#[cfg(test)]
#[path = "app_info_tests.rs"]
mod tests;
