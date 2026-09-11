// Запрещает, чтобы приложение уходило в фон при закрытии окна (Tauri 2 поведение по умолчанию — exit).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    jarogor_booklib_lib::run();
}