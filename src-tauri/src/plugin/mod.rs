//! Плагинная подсистема на основе WASM и Extism host runtime.

pub mod activation;
pub mod app_host;
pub mod app_info;
pub mod app_state;
pub mod bus;
pub mod contract;
pub mod cover_cache;
pub mod diagnostics;
pub mod discovery;
pub mod error;
pub mod loaded_plugin;
pub mod package;
pub mod plugin_kind;
pub mod plugin_level;
pub mod plugin_manifest;
pub mod plugin_scope;
pub mod relay;
pub mod runtime;
pub mod session;
pub mod shared_runtime;
pub mod source_contract;
pub mod viewer;
pub(crate) mod warmup;
pub(crate) mod wasm_cache;
pub mod webview_cache;

pub use app_host::AppPluginHost;
pub use app_info::AppInfo;
pub use app_state::{AppHostConfig, AppState, ReaderConfig};
pub use bus::{get_bus, set_log_level, EventBus, Severity};
pub use contract::{
    CAPABILITY_SETTINGS, CONTRACT_VERSION, EXPORT_FUNCTION, HOST_FS_LIST_DIR, HOST_FS_READ_TEXT,
    HOST_LOG_FUNCTION, MANIFEST_FILE_NAME,
};
pub use discovery::{discover_source_plugins, SourceProvider};
pub use error::PluginError;
pub use loaded_plugin::LoadedPlugin;
pub use plugin_kind::PluginKind;
pub use plugin_level::PluginLevel;
pub use plugin_manifest::PluginManifest;
pub use plugin_scope::PluginScope;
pub use runtime::PluginRuntime;
pub use session::PluginSession;
pub use shared_runtime::SharedRuntime;
