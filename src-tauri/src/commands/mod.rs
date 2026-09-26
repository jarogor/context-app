//! Generic IPC-команды host-приложения.

pub mod base_plugin_operation;
pub mod library_history_forget;
pub mod library_history_list;
pub mod plugin_operation;
pub mod select_source_library;

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
