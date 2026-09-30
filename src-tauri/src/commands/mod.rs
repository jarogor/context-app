//! Generic IPC-команды host-приложения.

pub mod active_library;
pub mod base_plugin_operation;
pub mod get_workspaces;
pub mod library_history_forget;
pub mod library_history_list;
pub mod plugin_activation_pending;
pub mod plugin_operation;
pub mod save_workspaces;
pub mod select_source_library;
pub mod workplace;

pub use active_library::__cmd__active_library;
pub use active_library::__tauri_command_name_active_library;
pub use active_library::active_library;

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

pub use workplace::__cmd__workplace_book_chunk;
pub use workplace::__cmd__workplace_formats;
pub use workplace::__cmd__workplace_plugin_for_format;
pub use workplace::__cmd__workplace_viewer;
pub use workplace::__tauri_command_name_workplace_book_chunk;
pub use workplace::__tauri_command_name_workplace_formats;
pub use workplace::__tauri_command_name_workplace_plugin_for_format;
pub use workplace::__tauri_command_name_workplace_viewer;
pub use workplace::workplace_book_chunk;
pub use workplace::workplace_formats;
pub use workplace::workplace_plugin_for_format;
pub use workplace::workplace_viewer;
