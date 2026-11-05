//! Команды проверки и установки обновлений приложения.

use std::path::PathBuf;
use std::sync::Mutex;

use crate::plugin::AppState;
use crate::update::{self, UpdateConfig, UpdateSource};

/// Снимок состояния обновлений для интерфейса.
#[derive(serde::Serialize)]
pub struct UpdateStatus {
    /// Текущая версия приложения.
    pub current_version: String,
    /// Настройки обновлений.
    pub config: UpdateConfig,
    /// Результат последней проверки, если она выполнялась.
    pub last_check: Option<update::UpdateCheck>,
}

/// Путь состояния и версия приложения под коротким замком.
fn context(state: &Mutex<AppState>) -> Result<(PathBuf, String), String> {
    let state = crate::commands::lock_state(state)?;
    Ok((
        state.app_state_root().to_path_buf(),
        state.app_info().version,
    ))
}

/// Сведения об обновлениях: источник и последняя проверка.
#[tauri::command]
pub async fn update_status(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<UpdateStatus, String> {
    let (root, current_version) = context(state.inner())?;
    let persisted = update::load_state(&root)?;
    Ok(UpdateStatus {
        current_version,
        config: persisted.config,
        last_check: persisted.last_check,
    })
}

/// Установка источника обновлений ядра.
#[tauri::command]
pub async fn update_source_set(
    state: tauri::State<'_, Mutex<AppState>>,
    source: UpdateSource,
) -> Result<UpdateConfig, String> {
    let (root, _) = context(state.inner())?;
    update::set_source(&root, source)
}

/// Сброс источника обновлений к значению по умолчанию.
#[tauri::command]
pub async fn update_source_clear(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<UpdateConfig, String> {
    let (root, _) = context(state.inner())?;
    update::clear_source(&root)
}

/// Включение или выключение проверки обновлений при запуске.
#[tauri::command]
pub async fn update_check_on_startup_set(
    state: tauri::State<'_, Mutex<AppState>>,
    enabled: bool,
) -> Result<UpdateConfig, String> {
    let (root, _) = context(state.inner())?;
    update::set_check_on_startup(&root, enabled)
}

/// Проверка обновления приложения по всем подключённым местам.
#[tauri::command]
pub async fn update_check(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<update::UpdateCheck, String> {
    let (root, current_version) = context(state.inner())?;
    let config = update::config(&root)?;
    // Приложение обновляется только из своего источника. Места плагинов в
    // проверке ядра не участвуют: иначе адрес плагинов влиял на версию
    // приложения, и было не понять, откуда что пришло.
    let sources: Vec<UpdateSource> = config.source.clone().into_iter().collect();
    update::check_sources_and_record(
        &root,
        &current_version,
        &sources,
        config.skipped_version.as_deref(),
    )
}

/// Подготовка и запуск установки обновления приложения.
#[tauri::command]
pub async fn update_apply(
    state: tauri::State<'_, Mutex<AppState>>,
) -> Result<update::ApplyOutcome, String> {
    let (root, current_version) = context(state.inner())?;
    let config = update::config(&root)?;
    let sources: Vec<UpdateSource> = config.source.clone().into_iter().collect();
    update::apply_sources(
        &root,
        &current_version,
        &sources,
        config.skipped_version.as_deref(),
    )
}

/// Возврат встроенного источника обновлений плагинов.
#[tauri::command]
pub async fn plugin_source_clear(state: tauri::State<'_, Mutex<AppState>>) -> Result<(), String> {
    let default = crate::update::default_plugin_source();
    crate::commands::with_app_host(state.inner(), |host| {
        host.reset_plugin_source(default)
            .map_err(|error| error.to_string())
    })
    .await?
}

/// Отказ от предлагаемой версии приложения.
#[tauri::command]
pub async fn update_skip(
    state: tauri::State<'_, Mutex<AppState>>,
    version: String,
) -> Result<UpdateConfig, String> {
    let (root, _) = context(state.inner())?;
    update::skip_version(&root, &version)
}

/// Перезапуск приложения без обновления.
#[tauri::command]
pub async fn update_restart() -> Result<(), String> {
    update::relaunch()?;
    std::process::exit(0);
}

/// Завершение приложения после подготовки обновления.
///
/// Замену файлов и повторный запуск выполняет помощник обновления, который ждёт
/// завершения текущего процесса.
#[tauri::command]
pub async fn update_quit() -> Result<(), String> {
    std::process::exit(0);
}
