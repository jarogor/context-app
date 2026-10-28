//! Команды проверки и установки обновлений приложения.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Deserialize;

use crate::plugin::AppState;
use crate::update::{self, UpdateConfig, UpdateSource};

/// Запись о месте обновления из реестра плагинов.
#[derive(Deserialize)]
struct StoreEntry {
    /// Вид места: папка или сетевой адрес.
    kind: String,
    /// Расположение.
    location: String,
}

/// Реестр мест обновления плагинов.
#[derive(Deserialize)]
struct StoresResponse {
    /// Подключённые места.
    #[serde(default)]
    stores: Vec<StoreEntry>,
}

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

/// Все места, откуда приложение и плагины получают обновления.
///
/// Основной список ведёт стор плагинов; встроенное место добавляется как
/// запасной вариант, если стор ещё не успел его зарегистрировать.
async fn collect_sources(
    state: &Mutex<AppState>,
    fallback: Option<UpdateSource>,
) -> Vec<UpdateSource> {
    let mut sources = Vec::new();
    let response = crate::commands::with_app_host(state, |host| {
        host.invoke_capability(
            crate::plugin::contract::CAPABILITY_PLUGIN_STORE,
            "stores_list",
            serde_json::json!({}),
        )
    })
    .await;
    if let Ok(Ok(text)) = response {
        if let Ok(list) = serde_json::from_str::<StoresResponse>(&text) {
            for store in list.stores {
                push_unique(
                    &mut sources,
                    UpdateSource {
                        kind: store.kind,
                        location: store.location,
                    },
                );
            }
        }
    }
    if let Some(source) = fallback {
        push_unique(&mut sources, source);
    }
    sources
}

/// Добавление места обновления без повторов.
fn push_unique(sources: &mut Vec<UpdateSource>, source: UpdateSource) {
    if source.location.trim().is_empty() {
        return;
    }
    if sources
        .iter()
        .any(|item| item.kind == source.kind && item.location == source.location)
    {
        return;
    }
    sources.push(source);
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
    let sources = collect_sources(state.inner(), config.source.clone()).await;
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
    let sources = collect_sources(state.inner(), config.source.clone()).await;
    update::apply_sources(
        &root,
        &current_version,
        &sources,
        config.skipped_version.as_deref(),
    )
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
