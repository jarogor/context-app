//! Generic IPC-команды host-приложения.

use std::sync::{Mutex, MutexGuard};

use crate::plugin::AppState;

pub mod active_library;
pub mod app_info;
pub mod app_log;
pub mod app_title_set;
pub mod base_plugin_operation;
pub mod get_workspaces;
pub mod interface_locale;
pub mod library_history_forget;
pub mod library_history_list;
pub mod open_folder;
pub mod plugin_activation_pending;
pub mod plugin_operation;
pub mod reader;
pub mod reader_cache;
pub mod reader_font;
pub mod reader_open_link;
pub mod reader_theme;
pub mod save_text_file;
pub mod save_workspaces;
pub mod select_source_library;
pub mod show_window;
pub mod support_report;
pub mod theme_palette;
pub mod theme_preference;
pub mod update;
pub mod window_open_tabs_limit;

pub use active_library::__cmd__active_library;
pub use active_library::__tauri_command_name_active_library;
pub use active_library::active_library;

pub use app_info::__cmd__app_info;
pub use app_info::__cmd__app_name_set;
pub use app_info::__cmd__diagnostics_open_folder;
pub use app_info::__tauri_command_name_app_info;
pub use app_info::__tauri_command_name_app_name_set;
pub use app_info::__tauri_command_name_diagnostics_open_folder;
pub use app_info::app_info;
pub use app_info::app_name_set;
pub use app_info::diagnostics_open_folder;

pub use app_log::__cmd__app_log;
pub use app_log::__tauri_command_name_app_log;
pub use app_log::app_log;

pub use app_title_set::__cmd__app_title_set;
pub use app_title_set::__tauri_command_name_app_title_set;
pub use app_title_set::app_title_set;

pub use get_workspaces::__cmd__get_workspaces;
pub use get_workspaces::__tauri_command_name_get_workspaces;
pub use get_workspaces::get_workspaces;

pub use save_workspaces::__cmd__save_workspaces;
pub use save_workspaces::__tauri_command_name_save_workspaces;
pub use save_workspaces::save_workspaces;

pub use save_text_file::__cmd__save_text_file;
pub use save_text_file::__tauri_command_name_save_text_file;
pub use save_text_file::save_text_file;

pub use base_plugin_operation::__cmd__invoke_base_plugin_operation;
pub use base_plugin_operation::__tauri_command_name_invoke_base_plugin_operation;
pub use base_plugin_operation::invoke_base_plugin_operation;

pub use plugin_operation::__cmd__invoke_plugin_operation;
pub use plugin_operation::__tauri_command_name_invoke_plugin_operation;
pub use plugin_operation::invoke_plugin_operation;

pub use open_folder::__cmd__open_folder;
pub use open_folder::__tauri_command_name_open_folder;
pub use open_folder::open_folder;

pub use library_history_forget::__cmd__library_history_forget;
pub use library_history_forget::__tauri_command_name_library_history_forget;
pub use library_history_forget::library_history_forget;

pub use library_history_list::__cmd__library_history_list;
pub use library_history_list::__tauri_command_name_library_history_list;
pub use library_history_list::library_history_list;

pub use select_source_library::__cmd__select_source_library;
pub use select_source_library::__tauri_command_name_select_source_library;
pub use select_source_library::select_source_library;

pub use support_report::__cmd__support_report;
pub use support_report::__cmd__support_report_save;
pub use support_report::__tauri_command_name_support_report;
pub use support_report::__tauri_command_name_support_report_save;
pub use support_report::support_report;
pub use support_report::support_report_save;

pub use plugin_activation_pending::__cmd__plugin_activation_pending;
pub use plugin_activation_pending::__tauri_command_name_plugin_activation_pending;
pub use plugin_activation_pending::plugin_activation_pending;

pub use reader_cache::__cmd__reader_cache_forget;
pub use reader_cache::__cmd__reader_cache_load;
pub use reader_cache::__cmd__reader_cache_save;
pub use reader_cache::__tauri_command_name_reader_cache_forget;
pub use reader_cache::__tauri_command_name_reader_cache_load;
pub use reader_cache::__tauri_command_name_reader_cache_save;
pub use reader_cache::reader_cache_forget;
pub use reader_cache::reader_cache_load;
pub use reader_cache::reader_cache_save;

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

pub use interface_locale::__cmd__interface_locale;
pub use interface_locale::__tauri_command_name_interface_locale;
pub use interface_locale::interface_locale;

pub use update::__cmd__plugin_source_clear;
pub use update::__cmd__update_apply;
pub use update::__cmd__update_check;
pub use update::__cmd__update_check_on_startup_set;
pub use update::__cmd__update_quit;
pub use update::__cmd__update_restart;
pub use update::__cmd__update_skip;
pub use update::__cmd__update_source_clear;
pub use update::__cmd__update_source_set;
pub use update::__cmd__update_status;
pub use update::__tauri_command_name_plugin_source_clear;
pub use update::__tauri_command_name_update_apply;
pub use update::__tauri_command_name_update_check;
pub use update::__tauri_command_name_update_check_on_startup_set;
pub use update::__tauri_command_name_update_quit;
pub use update::__tauri_command_name_update_restart;
pub use update::__tauri_command_name_update_skip;
pub use update::__tauri_command_name_update_source_clear;
pub use update::__tauri_command_name_update_source_set;
pub use update::__tauri_command_name_update_status;
pub use update::plugin_source_clear;
pub use update::update_apply;
pub use update::update_check;
pub use update::update_check_on_startup_set;
pub use update::update_quit;
pub use update::update_restart;
pub use update::update_skip;
pub use update::update_source_clear;
pub use update::update_source_set;
pub use update::update_status;

pub use reader_font::__cmd__reader_font;
pub use reader_font::__tauri_command_name_reader_font;
pub use reader_font::reader_font;
pub use reader_open_link::__cmd__reader_open_link;
pub use reader_open_link::__tauri_command_name_reader_open_link;
pub use reader_open_link::reader_open_link;
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
