//! Tauri IPC-команды: точки входа для фронтенда.
//!
//! Логика каждой команды вынесена в собственный подмодуль; здесь —
//! компактный перечень команд и переэкспорт их для `generate_handler!`.

pub mod cached_libraries;
pub mod content;
pub mod get_book_content;
pub mod get_cover;
pub mod import_book;
pub mod library_info;
pub mod list_books;
pub mod open_book_in_system;
pub mod open_library;
pub mod search_books;

pub use cached_libraries::list_cached_libraries;
pub use content::BookContent;
pub use get_book_content::get_book_content;
pub use get_cover::get_cover;
pub use import_book::import_book;
pub use library_info::get_library_info;
pub use list_books::list_books;
pub use open_book_in_system::open_book_in_system;
pub use open_library::open_library;
pub use search_books::search_books;

// Сгенерированные макросом `#[tauri::command]` служебные макросы
// переэкспортируются, чтобы `tauri::generate_handler!` нашёл их
// в модуле `commands`.

pub use cached_libraries::__cmd__list_cached_libraries;
pub use cached_libraries::__tauri_command_name_list_cached_libraries;
pub use get_book_content::__cmd__get_book_content;
pub use get_book_content::__tauri_command_name_get_book_content;
pub use get_cover::__cmd__get_cover;
pub use get_cover::__tauri_command_name_get_cover;
pub use import_book::__cmd__import_book;
pub use import_book::__tauri_command_name_import_book;
pub use library_info::__cmd__get_library_info;
pub use library_info::__tauri_command_name_get_library_info;
pub use list_books::__cmd__list_books;
pub use list_books::__tauri_command_name_list_books;
pub use open_book_in_system::__cmd__open_book_in_system;
pub use open_book_in_system::__tauri_command_name_open_book_in_system;
pub use open_library::__cmd__open_library;
pub use open_library::__tauri_command_name_open_library;
pub use search_books::__cmd__search_books;
pub use search_books::__tauri_command_name_search_books;
