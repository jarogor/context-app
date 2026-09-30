//! Абстракция host-функций базового плагина заметок.
//!
//! Позволяет тестировать диспетчер операций нативно с фейковой реализацией,
//! а WASM-сборке — использовать host-функции приложения.

/// Host-функции, необходимые плагину заметок.
pub trait Host {
    /// Чтение служебного состояния по ключу.
    fn state_read(&self, key: &str) -> Result<Option<String>, String>;
    /// Запись служебного состояния по ключу.
    fn state_write(&self, key: &str, value: &str) -> Result<(), String>;
    /// Публикация именованного прикладного события.
    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String>;
    /// Текущее время Unix в миллисекундах.
    fn now_millis(&self) -> i64;
}
