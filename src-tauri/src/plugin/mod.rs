//! Плагинная подсистема на основе WASM и Extism host runtime.

pub mod contract;
pub mod error;
pub mod runtime;

pub use contract::{
    PluginManifest, CONTRACT_VERSION, EXPORT_FUNCTION, HOST_FUNCTIONS, HOST_LOG_FUNCTION,
    MANIFEST_FILE_NAME,
};
pub use error::PluginError;
pub use runtime::{HostSink, LoadedPlugin, PluginRuntime};
