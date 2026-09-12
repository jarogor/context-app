//! Tauri IPC-команды: точки входа для фронтенда.
//!
//! Логика каждой команды вынесена в собственный подмодуль; здесь —
//! компактный перечень команд и переэкспорт их для `generate_handler!`.

pub mod content;
pub mod get_book_content;
pub mod get_cover;
pub mod import_book;
pub mod list_books;

pub use content::BookContent;
pub use get_book_content::get_book_content;
pub use get_cover::get_cover;
pub use import_book::import_book;
pub use list_books::list_books;

// Сгенерированные макросом `#[tauri::command]` служебные макросы
// переэкспортируются, чтобы `tauri::generate_handler!` нашёл их
// в модуле `commands`.

pub use get_book_content::__cmd__get_book_content;
pub use get_book_content::__tauri_command_name_get_book_content;
pub use get_cover::__cmd__get_cover;
pub use get_cover::__tauri_command_name_get_cover;
pub use import_book::__cmd__import_book;
pub use import_book::__tauri_command_name_import_book;
pub use list_books::__cmd__list_books;
pub use list_books::__tauri_command_name_list_books;
