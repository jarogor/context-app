//! Плагинная подсистема на основе WASM и Extism host runtime.

pub mod contract;
pub mod error;
pub mod host_sink;
pub mod loaded_plugin;
pub mod plugin_manifest;
pub mod runtime;

pub use contract::{
    CONTRACT_VERSION, EXPORT_FUNCTION, HOST_FUNCTIONS, HOST_LOG_FUNCTION, MANIFEST_FILE_NAME,
};
pub use error::PluginError;
pub use host_sink::HostSink;
pub use loaded_plugin::LoadedPlugin;
pub use plugin_manifest::PluginManifest;
pub use runtime::PluginRuntime;
