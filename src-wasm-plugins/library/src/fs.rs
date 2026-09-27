//! Абстракция доступа к файловой системе библиотеки для плагина.
//!
//! В WASM-окружении реализуется host-функцией `fs_list_dir`, в нативных
//! тестах — чтением локальных папок. Пути передаются относительно корня
//! библиотеки.

use crate::models::DirEntry;

/// Доступ к файловой системе библиотеки.
pub(crate) trait Fs {
    /// Перечисление записей директории относительно корня.
    ///
    /// Для не-директории (файла) внутри песочницы возвращается пустой список.
    fn list_dir(&self, path: &str) -> Result<Vec<DirEntry>, String>;

    /// Чтение бинарного файла относительно корня.
    fn read_bytes(&self, path: &str) -> Result<Vec<u8>, String>;

    /// Чтение файла, выбранного пользователем для импорта.
    fn import_read_bytes(&self, path: &str) -> Result<Vec<u8>, String>;

    /// Запись файла в portable root.
    fn write_bytes(&self, path: &str, bytes: &[u8]) -> Result<(), String>;

    /// Открытие файла системным приложением.
    fn open_file(&self, path: &str) -> Result<(), String>;

    /// Чтение служебного состояния по ключу.
    fn state_read(&self, key: &str) -> Result<Option<String>, String>;

    /// Атомарная запись служебного состояния по ключу.
    fn state_write(&self, key: &str, value: &str) -> Result<(), String>;

    /// Удаление служебного состояния по ключу.
    fn state_delete(&self, key: &str) -> Result<(), String>;
}
