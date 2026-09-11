pub mod catalog;
pub mod commands;
pub mod import;
pub mod library;
pub mod reading;

use std::sync::Mutex;

use tauri::Manager;

use crate::catalog::open_catalog;
use crate::library::Library;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app.path().app_data_dir()?;
            let library_root = data_dir.join("library");
            let mut library = Library::open(&library_root)?;
            open_catalog(library.connection_mut())?;
            app.manage(Mutex::new(library));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_books,
            commands::get_cover,
            commands::get_book_content,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}