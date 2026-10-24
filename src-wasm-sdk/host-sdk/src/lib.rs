//! Общая host-обвязка базовых плагинов приложения «Контекст».
//!
//! Крейт выделяет то, что дословно совпадало у `notes-store`, `notifications`,
//! `settings` и `plugin-store`: трейт [`Host`] с чтением/записью служебного
//! состояния и публикацией события, разбор [`Request`] по контракту и шаблон
//! загрузки/сохранения состояния. WASM-реализация [`wasm::HostEnv`] объявляет
//! host-функции ядра поверх `extism_pdk::host_fn`.
//!
//! Модели, наборы действий и ключи состояния остаются в самих плагинах.

pub mod host;
pub mod request;
pub mod state;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

pub use host::Host;
pub use request::Request;
