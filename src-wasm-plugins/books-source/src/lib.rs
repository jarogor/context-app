//! Базовый source-плагин создания/открытия библиотеки для приложения
//! «Контекст».
//!
//! Экспортирует функцию `invoke` по контракту приложения и использует
//! host-функцию `fs_list_dir` для чтения каталога книг. В нативных тестах
//! чтение файловой системы заменяется локальной реализацией `Fs`. Общие модели
//! каталога и хелперы вынесены в крейт `source-protocol`.

pub(crate) mod djvu;
pub(crate) mod epub;
pub(crate) mod fb2;
pub(crate) mod fs;
pub(crate) mod index;
pub(crate) mod lifecycle;
pub(crate) mod metadata;
pub(crate) mod migrations;
pub(crate) mod models;
pub(crate) mod pdf;
pub(crate) mod portable;
pub(crate) mod scanner;

#[cfg(target_arch = "wasm32")]
mod wasm;

#[cfg(test)]
mod test_fs;
#[cfg(test)]
mod test_sql;
