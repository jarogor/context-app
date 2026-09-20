//! Generic IPC-команды host-приложения.

pub mod open_source;
pub mod plugin_operation;
pub mod source_info;

pub use open_source::open_source;
pub use plugin_operation::invoke_plugin_operation;
pub use source_info::get_source_info;

pub use open_source::__cmd__open_source;
pub use open_source::__tauri_command_name_open_source;
pub use plugin_operation::__cmd__invoke_plugin_operation;
pub use plugin_operation::__tauri_command_name_invoke_plugin_operation;
pub use source_info::__cmd__get_source_info;
pub use source_info::__tauri_command_name_get_source_info;
