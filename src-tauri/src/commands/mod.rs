//! Generic IPC-команды host-приложения.

pub mod plugin_operation;

pub use plugin_operation::invoke_plugin_operation;

pub use plugin_operation::__cmd__invoke_plugin_operation;
pub use plugin_operation::__tauri_command_name_invoke_plugin_operation;
