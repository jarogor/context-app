//! Проверка и установка обновлений приложения.
//!
//! Ядро приложения — сам исполняемый файл и каркасные плагины — обновляется
//! одним пакетом из одного источника. Прикладные плагины обновляются по частям
//! через стор плагинов и в этот модуль не входят.
//!
//! Источник обновлений может быть файловым каталогом или сетевым адресом; в
//! обоих случаях он содержит `update-index.json` и артефакты, на которые тот
//! ссылается.

pub mod models;
pub mod package;
pub mod source;
pub mod state;
pub mod version;

use std::path::Path;
use std::process::Command;

pub use models::{
    ApplyOutcome, AvailableCore, CoreRelease, PluginRelease, ReleaseArtifact, ReleaseMode,
    UpdateCheck, UpdateConfig, UpdateIndex, UpdateSource,
};
pub use state::PersistedUpdate;

/// Максимальный размер индекса обновлений.
const MAX_INDEX_BYTES: usize = 2 * 1024 * 1024;

/// Максимальный размер скачиваемого артефакта обновления.
const MAX_ARTIFACT_BYTES: u64 = 1024 * 1024 * 1024;

/// Таймаут сетевых запросов обновлений в секундах.
const NETWORK_TIMEOUT_SECS: u64 = 30;

/// Сетевой адрес обновлений по умолчанию для выпуска.
///
/// Может быть переопределён при сборке переменной `CONTEXT_UPDATE_URL`.
#[cfg(not(debug_assertions))]
const DEFAULT_NETWORK_UPDATE_SOURCE: &str = "https://updates.jarogor.ru/context";

/// Загрузка состояния обновлений с источником по умолчанию.
///
/// Сохранённый файловый источник проверяется на съехавший путь: если каталог
/// сам не содержит индекса, а подкаталог `updates` содержит, источник
/// переводится на него. Так исправляется источник, указанный на корень данных
/// (`dev_data`) вместо каталога обновлений внутри него.
pub fn load_state(state_root: &Path) -> Result<PersistedUpdate, String> {
    let mut state = state::load_or_default(state_root, default_source())?;
    if let Some(source) = state.config.source.clone() {
        if let Some(migrated) = migrate_file_source(&source) {
            state.config.source = Some(migrated);
            let _ = state::save(state_root, &state);
        }
    }
    Ok(state)
}

/// Исправленный файловый источник, если путь указывает на родительский каталог.
///
/// Индекс обновлений лежит в собственном каталоге `updates`, а не в корне
/// данных приложения: в корне рядом с ним живут состояние, плагины и кеш.
fn migrate_file_source(source: &UpdateSource) -> Option<UpdateSource> {
    if source.kind != "file" {
        return None;
    }
    let root = Path::new(&source.location);
    if root.join(source::INDEX_FILE_NAME).is_file() {
        return None;
    }
    let nested = root.join("updates");
    if !nested.join(source::INDEX_FILE_NAME).is_file() {
        return None;
    }
    Some(UpdateSource {
        kind: source.kind.clone(),
        location: nested.to_string_lossy().into_owned(),
    })
}

/// Настройки обновлений.
pub fn config(state_root: &Path) -> Result<UpdateConfig, String> {
    Ok(load_state(state_root)?.config)
}

/// Сохранение источника обновлений.
pub fn set_source(state_root: &Path, source: UpdateSource) -> Result<UpdateConfig, String> {
    source.validate()?;
    let mut config = config(state_root)?;
    config.source = Some(source);
    // Новый источник может предлагать другую линейку версий: прежний отказ
    // больше не должен скрывать выпуск.
    config.skipped_version = None;
    save_config(state_root, &config)
}

/// Сброс источника обновлений к значению по умолчанию.
///
/// Источник есть всегда: пользователь не должен оставаться без обновлений
/// из-за пустой настройки.
pub fn clear_source(state_root: &Path) -> Result<UpdateConfig, String> {
    let mut config = config(state_root)?;
    config.source = default_source();
    config.skipped_version = None;
    save_config(state_root, &config)
}

/// Сохранение признака проверки обновлений при запуске.
pub fn set_check_on_startup(state_root: &Path, enabled: bool) -> Result<UpdateConfig, String> {
    let mut config = config(state_root)?;
    config.check_on_startup = enabled;
    save_config(state_root, &config)
}

/// Сохранение настроек обновлений.
pub fn save_config(state_root: &Path, config: &UpdateConfig) -> Result<UpdateConfig, String> {
    let state = state::save_config(state_root, config)?;
    Ok(state.config)
}

/// Проверка обновления ядра по одному источнику.
///
/// Отсутствие настроенного источника — не ошибка: возвращается пустой результат.
/// Ошибка чтения источника попадает в список ошибок, чтобы интерфейс мог
/// показать её, не прерывая запуск приложения.
pub fn check(state_root: &Path, current_version: &str) -> Result<UpdateCheck, String> {
    let state = load_state(state_root)?;
    let sources: Vec<UpdateSource> = state.config.source.clone().into_iter().collect();
    Ok(check_sources(
        current_version,
        &sources,
        state.config.skipped_version.as_deref(),
    ))
}

/// Проверка обновления ядра по всем подключённым источникам.
///
/// Выбирается самый новый выпуск, для которого есть артефакт текущей платформы.
/// Ошибки отдельных источников не прерывают проверку остальных.
pub fn check_sources(
    current_version: &str,
    sources: &[UpdateSource],
    skipped_version: Option<&str>,
) -> UpdateCheck {
    let (selected, errors) = select_core(current_version, sources, skipped_version);
    UpdateCheck {
        source: selected
            .as_ref()
            .map(|item| item.source.clone())
            .or_else(|| sources.first().cloned()),
        core: selected.map(|item| AvailableCore {
            current_version: current_version.to_string(),
            version: item.core.version,
            notes: item.core.notes,
            mode: item.artifact.mode,
        }),
        checked_at_millis: now_millis(),
        errors,
    }
}

/// Проверка с сохранением результата в состоянии.
pub fn check_and_record(state_root: &Path, current_version: &str) -> Result<UpdateCheck, String> {
    let check = check(state_root, current_version)?;
    state::record_check(state_root, &check)?;
    Ok(check)
}

/// Проверка по источникам с сохранением результата.
pub fn check_sources_and_record(
    state_root: &Path,
    current_version: &str,
    sources: &[UpdateSource],
    skipped_version: Option<&str>,
) -> Result<UpdateCheck, String> {
    let check = check_sources(current_version, sources, skipped_version);
    state::record_check(state_root, &check)?;
    Ok(check)
}

/// Применение обновления ядра из настроенного источника.
pub fn apply(state_root: &Path, current_version: &str) -> Result<ApplyOutcome, String> {
    let config = config(state_root)?;
    let sources: Vec<UpdateSource> = config.source.clone().into_iter().collect();
    apply_sources(
        state_root,
        current_version,
        &sources,
        config.skipped_version.as_deref(),
    )
}

/// Применение обновления ядра из любого подходящего источника.
pub fn apply_sources(
    state_root: &Path,
    current_version: &str,
    sources: &[UpdateSource],
    skipped_version: Option<&str>,
) -> Result<ApplyOutcome, String> {
    let (selected, errors) = select_core(current_version, sources, skipped_version);
    let Some(selected) = selected else {
        return Err(if errors.is_empty() {
            "обновление не найдено".to_string()
        } else {
            errors.join("; ")
        });
    };
    let outcome = package::apply_release(
        state_root,
        &selected.source,
        &selected.core,
        &selected.artifact,
    )?;
    let mut state = state::load_or_default(state_root, default_source())?;
    state.last_check = None;
    state::save(state_root, &state)?;
    Ok(outcome)
}

/// Выбранный выпуск ядра и источник, из которого он получен.
struct SelectedCore {
    /// Источник выпуска.
    source: UpdateSource,
    /// Описание выпуска.
    core: CoreRelease,
    /// Артефакт текущей платформы.
    artifact: ReleaseArtifact,
}

/// Выбор самого нового выпуска ядра среди источников.
fn select_core(
    current_version: &str,
    sources: &[UpdateSource],
    skipped_version: Option<&str>,
) -> (Option<SelectedCore>, Vec<String>) {
    let platform = version::platform_key();
    let mut best: Option<SelectedCore> = None;
    let mut errors = Vec::new();
    for source in sources {
        if let Err(error) = source.validate() {
            errors.push(error);
            continue;
        }
        let index = match source::read_index(source) {
            Ok(index) => index,
            Err(error) => {
                errors.push(error);
                continue;
            }
        };
        let Some(core) = index.core else {
            continue;
        };
        if skipped_version.is_some_and(|skipped| skipped == core.version) {
            continue;
        }
        match version::is_newer(current_version, &core.version) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(error) => {
                errors.push(error);
                continue;
            }
        }
        let Some(artifact) = core.platforms.get(&platform).cloned() else {
            errors.push(format!(
                "в выпуске {} нет файла для этой системы",
                core.version
            ));
            continue;
        };
        let newer = match &best {
            Some(best) => version::is_newer(&best.core.version, &core.version).unwrap_or(false),
            None => true,
        };
        if newer {
            best = Some(SelectedCore {
                source: source.clone(),
                core,
                artifact,
            });
        }
    }
    (best, errors)
}

/// Запоминание версии, которую больше не нужно предлагать.
pub fn skip_version(state_root: &Path, version: &str) -> Result<UpdateConfig, String> {
    let state = state::skip_version(state_root, version)?;
    Ok(state.config)
}

/// Перезапуск приложения: запуск текущего исполняемого файла и завершение.
///
/// Используется после обновления прикладных плагинов, когда ядро не менялось.
pub fn relaunch() -> Result<(), String> {
    let executable =
        std::env::current_exe().map_err(|error| format!("путь приложения недоступен: {error}"))?;
    Command::new(executable)
        .spawn()
        .map_err(|error| format!("приложение не перезапущено: {error}"))?;
    Ok(())
}

/// Источник обновлений по умолчанию.
///
/// В разработке проверяются файлы из `dev_data` в корне проекта, в выпуске —
/// сетевой адрес. Явно заданная переменная окружения `CONTEXT_UPDATE_SOURCE`
/// имеет приоритет над обоими значениями.
fn default_source() -> Option<UpdateSource> {
    if let Some(value) = std::env::var_os("CONTEXT_UPDATE_SOURCE") {
        let value = value.to_string_lossy().into_owned();
        if let Some((kind, location)) = value.split_once(':') {
            let source = UpdateSource {
                kind: kind.to_string(),
                location: location.to_string(),
            };
            if source.validate().is_ok() {
                return Some(source);
            }
        }
    }
    #[cfg(debug_assertions)]
    {
        Some(UpdateSource {
            kind: "file".to_string(),
            location: crate::paths::dev_data_dir()
                .join("updates")
                .to_string_lossy()
                .into_owned(),
        })
    }
    #[cfg(not(debug_assertions))]
    {
        let location = option_env!("CONTEXT_UPDATE_URL")
            .unwrap_or(DEFAULT_NETWORK_UPDATE_SOURCE)
            .to_string();
        Some(UpdateSource {
            kind: "network".to_string(),
            location,
        })
    }
}

/// Текущее время в миллисекундах Unix.
fn now_millis() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as i64)
        .unwrap_or_default()
}

#[cfg(test)]
#[path = "mod_tests.rs"]
mod tests;
