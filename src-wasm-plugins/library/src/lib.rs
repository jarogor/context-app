//! Базовый source-плагин создания/открытия библиотеки для Jarogor BookLib.
//!
//! Экспортирует функцию `invoke` по контракту приложения и использует
//! host-функцию `fs_list_dir` для чтения каталога книг. В нативных тестах
//! чтение файловой системы заменяется локальной реализацией `Fs`.

pub(crate) mod epub;
pub(crate) mod fs;
pub(crate) mod lifecycle;
pub(crate) mod models;
pub(crate) mod portable;
pub(crate) mod scanner;

#[cfg(target_arch = "wasm32")]
mod wasm;
