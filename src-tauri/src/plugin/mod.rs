//! Плагинная подсистема на основе WASM и Extism host runtime.

pub mod app_host;
pub mod app_state;
pub mod bus;
pub mod contract;
pub mod error;
pub mod loaded_plugin;
pub mod plugin_kind;
pub mod plugin_manifest;
pub mod relay;
pub mod runtime;
pub mod session;

pub use app_host::AppPluginHost;
pub use app_state::AppState;
pub use bus::{get_bus, EventBus, PluginEvent};
pub use contract::{
    CAPABILITY_NOTIFICATIONS, CONTRACT_VERSION, EXPORT_FUNCTION, HOST_FS_LIST_DIR,
    HOST_FS_READ_TEXT, HOST_FUNCTIONS, HOST_LOG_FUNCTION, MANIFEST_FILE_NAME,
};
pub use error::PluginError;
pub use loaded_plugin::LoadedPlugin;
pub use plugin_kind::PluginKind;
pub use plugin_manifest::PluginManifest;
pub use runtime::PluginRuntime;
pub use session::PluginSession;
