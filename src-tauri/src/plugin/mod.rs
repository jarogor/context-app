//! Плагинная подсистема на основе WASM и Extism host runtime.

pub mod activation;
pub mod app_host;
pub mod app_info;
pub mod app_state;
pub mod bus;
pub mod contract;
pub mod discovery;
pub mod error;
pub mod loaded_plugin;
pub mod package;
pub mod plugin_kind;
pub mod plugin_manifest;
pub mod relay;
pub mod runtime;
pub mod session;
pub mod viewer;
pub(crate) mod warmup;
pub(crate) mod wasm_cache;

pub use app_host::AppPluginHost;
pub use app_info::AppInfo;
pub use app_state::{AppState, ReaderConfig};
pub use bus::{get_bus, set_log_level, EventBus, PluginEvent, Severity};
pub use contract::{
    CAPABILITY_NOTIFICATIONS, CAPABILITY_SETTINGS, CONTRACT_VERSION, EXPORT_FUNCTION,
    HOST_FS_LIST_DIR, HOST_FS_READ_TEXT, HOST_FUNCTIONS, HOST_LOG_FUNCTION, MANIFEST_FILE_NAME,
};
pub use discovery::{discover_source_plugins, SourceProvider};
pub use error::PluginError;
pub use loaded_plugin::LoadedPlugin;
pub use plugin_kind::PluginKind;
pub use plugin_manifest::PluginManifest;
pub use runtime::PluginRuntime;
pub use session::PluginSession;
