//! Generic IPC-команды host-приложения.

use std::sync::{Mutex, MutexGuard};

use crate::plugin::AppState;

pub mod active_library;
pub mod app_info;
pub mod base_plugin_operation;
pub mod get_workspaces;
pub mod library_history_forget;
pub mod library_history_list;
pub mod plugin_activation_pending;
pub mod plugin_operation;
pub mod reader;
pub mod reader_font;
pub mod reader_theme;
pub mod save_workspaces;
pub mod select_source_library;
pub mod show_window;
pub mod theme_palette;
pub mod theme_preference;
pub mod window_open_tabs_limit;

pub use active_library::__cmd__active_library;
pub use active_library::__tauri_command_name_active_library;
pub use active_library::active_library;

pub use app_info::__cmd__app_info;
pub use app_info::__tauri_command_name_app_info;
pub use app_info::app_info;

pub use get_workspaces::__cmd__get_workspaces;
pub use get_workspaces::__tauri_command_name_get_workspaces;
pub use get_workspaces::get_workspaces;

pub use save_workspaces::__cmd__save_workspaces;
pub use save_workspaces::__tauri_command_name_save_workspaces;
pub use save_workspaces::save_workspaces;

pub use base_plugin_operation::__cmd__invoke_base_plugin_operation;
pub use base_plugin_operation::__tauri_command_name_invoke_base_plugin_operation;
pub use base_plugin_operation::invoke_base_plugin_operation;

pub use plugin_operation::__cmd__invoke_plugin_operation;
pub use plugin_operation::__tauri_command_name_invoke_plugin_operation;
pub use plugin_operation::invoke_plugin_operation;

pub use library_history_forget::__cmd__library_history_forget;
pub use library_history_forget::__tauri_command_name_library_history_forget;
pub use library_history_forget::library_history_forget;

pub use library_history_list::__cmd__library_history_list;
pub use library_history_list::__tauri_command_name_library_history_list;
pub use library_history_list::library_history_list;

pub use select_source_library::__cmd__select_source_library;
pub use select_source_library::__tauri_command_name_select_source_library;
pub use select_source_library::select_source_library;

pub use plugin_activation_pending::__cmd__plugin_activation_pending;
pub use plugin_activation_pending::__tauri_command_name_plugin_activation_pending;
pub use plugin_activation_pending::plugin_activation_pending;

pub use reader::__cmd__reader_book_chunk;
pub use reader::__cmd__reader_content;
pub use reader::__cmd__reader_cover;
pub use reader::__cmd__reader_forget_book;
pub use reader::__cmd__reader_formats;
pub use reader::__cmd__reader_open_external;
pub use reader::__cmd__reader_plugin_for_format;
pub use reader::__cmd__reader_viewer;
pub use reader::__cmd__reader_viewer_file;
pub use reader::__cmd__reader_viewer_files;
pub use reader::__cmd__workspace_covers;
pub use reader::__tauri_command_name_reader_book_chunk;
pub use reader::__tauri_command_name_reader_content;
pub use reader::__tauri_command_name_reader_cover;
pub use reader::__tauri_command_name_reader_forget_book;
pub use reader::__tauri_command_name_reader_formats;
pub use reader::__tauri_command_name_reader_open_external;
pub use reader::__tauri_command_name_reader_plugin_for_format;
pub use reader::__tauri_command_name_reader_viewer;
pub use reader::__tauri_command_name_reader_viewer_file;
pub use reader::__tauri_command_name_reader_viewer_files;
pub use reader::__tauri_command_name_workspace_covers;
pub use reader::reader_book_chunk;
pub use reader::reader_content;
pub use reader::reader_cover;
pub use reader::reader_forget_book;
pub use reader::reader_formats;
pub use reader::reader_open_external;
pub use reader::reader_plugin_for_format;
pub use reader::reader_viewer;
pub use reader::reader_viewer_file;
pub use reader::reader_viewer_files;
pub use reader::workspace_covers;

pub use theme_preference::__cmd__theme_preference;
pub use theme_preference::__tauri_command_name_theme_preference;
pub use theme_preference::theme_preference;

pub use theme_palette::__cmd__theme_palette;
pub use theme_palette::__tauri_command_name_theme_palette;
pub use theme_palette::theme_palette;

pub use reader_font::__cmd__reader_font;
pub use reader_font::__tauri_command_name_reader_font;
pub use reader_font::reader_font;
pub use reader_theme::__cmd__reader_theme;
pub use reader_theme::__tauri_command_name_reader_theme;
pub use reader_theme::reader_theme;

pub use show_window::__cmd__show_window;
pub use show_window::__tauri_command_name_show_window;
pub use show_window::show_window;

pub use window_open_tabs_limit::__cmd__window_open_tabs_limit;
pub use window_open_tabs_limit::__tauri_command_name_window_open_tabs_limit;
pub use window_open_tabs_limit::window_open_tabs_limit;

/// Захват общего состояния приложения с единым сообщением об ошибке.
pub fn lock_state(state: &Mutex<AppState>) -> Result<MutexGuard<'_, AppState>, String> {
    Mutex::lock(state).map_err(|error| error.to_string())
}

/// Ожидание готовности app-level runtime и выполнение операции над ним.
///
/// Дескриптор runtime берётся под коротким общим замком состояния, который
/// сразу освобождается; готовность фоновой сборки ожидается уже на замке самого
/// runtime. Так тяжёлая компиляция не удерживает общий замок `AppState`.
pub async fn with_app_host<T>(
    state: &Mutex<AppState>,
    action: impl FnOnce(&mut crate::plugin::AppPluginHost) -> T,
) -> Result<T, String> {
    let handle = {
        let mut state = lock_state(state)?;
        state.app_host_handle()
    };
    handle.with_ready(action)
}
