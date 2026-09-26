//! Абстракция доступа плагина стора к приложению.
//!
//! Позволяет держать логику стора независимой от host-функций и покрывать её
//! тестами с подставным окружением.

use crate::models::{Installed, PluginEntry};

/// Операции приложения, доступные плагину стора.
pub trait Host {
    /// Чтение манифеста из пакета без установки.
    fn store_inspect(&self, path: &str) -> Result<Installed, String>;
    /// Установка пакета по пути к zip-файлу.
    fn store_install(&self, path: &str) -> Result<Installed, String>;
    /// Удаление установленного плагина по идентификатору.
    fn store_uninstall(&self, id: &str) -> Result<(), String>;
    /// Список установленных плагинов.
    fn store_installed(&self) -> Result<Vec<Installed>, String>;
    /// Перечень отключаемых плагинов.
    fn store_plugins(&self) -> Result<Vec<PluginEntry>, String>;
    /// Переключение активности плагина по идентификатору.
    fn store_set_enabled(&self, id: &str, enabled: bool) -> Result<(), String>;
    /// Чтение текстового файла по пути.
    fn read_file_text(&self, path: &str) -> Result<String, String>;
    /// Чтение служебного состояния по ключу.
    fn state_read(&self, key: &str) -> Result<Option<String>, String>;
    /// Запись служебного состояния по ключу.
    fn state_write(&self, key: &str, value: &str) -> Result<(), String>;
    /// Публикация прикладного события.
    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String>;
}
