//! Локальный индекс внешней библиотеки Calibre.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::models::{
    CachedLibrary, IndexedBook, IndexedFile, IndexedFileKind, ScannedBook, ScannedFile,
    ScannedFileKind,
};

/// Версия формата локального индекса. При несовпадении индекс пересобирается.
const INDEX_VERSION: u32 = 3;
/// Имя папки с индексами рядом с исполняемым файлом приложения.
const INDEX_DIRECTORY: &str = ".booklib";

/// Локальный индекс одной библиотеки Calibre.
///
/// Хранит версию формата и канонический корневой путь для инвалидации,
/// а также проиндексированные книги.
#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct LibraryIndex {
    /// Версия формата индекса.
    version: u32,
    /// Канонический корневой путь библиотеки.
    root: String,
    /// Проиндексированные книги.
    pub books: Vec<IndexedBook>,
}

impl LibraryIndex {
    /// Построение индекса по результатам полного сканирования.
    pub(crate) fn from_scanned(root: &Path, books: Vec<ScannedBook>) -> Self {
        Self {
            version: INDEX_VERSION,
            root: canonical_string(root),
            books: books
                .into_iter()
                .map(|book| IndexedBook::from_scanned(root, book))
                .collect(),
        }
    }

    /// Проверка, что индекс соответствует текущей версии и корню.
    pub(crate) fn validate_root(&self, root: &Path) -> bool {
        self.version == INDEX_VERSION && self.root == canonical_string(root)
    }

    /// Преобразование всех проиндексированных книг в результаты сканирования.
    pub(crate) fn scanned_books(&self) -> Vec<ScannedBook> {
        self.books.iter().map(IndexedBook::scanned).collect()
    }

    /// Определение папок книг, содержимое которых изменилось.
    ///
    /// Используется только в тестах частичного обновления индекса.
    #[cfg(test)]
    pub(crate) fn changed_directories(&self, root: &Path) -> std::collections::HashSet<PathBuf> {
        let mut changed = std::collections::HashSet::new();
        for book in &self.books {
            let directory = root.join(&book.directory);
            let metadata_changed =
                file_modified(&directory.join("metadata.opf")) != book.metadata_modified;
            let files_changed = book.files.iter().any(|file| {
                let path = root.join(&file.path);
                let Ok(metadata) = fs::metadata(path) else {
                    return true;
                };
                let modified = metadata
                    .modified()
                    .ok()
                    .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
                    .map_or(0, |value| value.as_nanos());
                metadata.len() != file.size || modified != file.modified
            });
            if metadata_changed || files_changed || !directory.is_dir() {
                changed.insert(directory);
            }
        }
        changed
    }

    /// Замена в индексе только указанных папок книг.
    ///
    /// Используется только в тестах частичного обновления индекса.
    #[cfg(test)]
    pub(crate) fn replace_directories(
        &mut self,
        root: &Path,
        directories: &std::collections::HashSet<PathBuf>,
    ) -> io::Result<()> {
        self.books
            .retain(|book| !directories.contains(&root.join(&book.directory)));
        for directory in directories {
            let Some(author) = directory
                .parent()
                .and_then(|parent| parent.file_name())
                .and_then(|name| name.to_str())
            else {
                continue;
            };
            if let Some(book) = super::scanner::scan_book_directory(root, author, directory)? {
                self.books.push(IndexedBook::from_scanned(root, book));
            }
        }
        Ok(())
    }

    /// Загрузка индекса из файла с проверкой версии и корневого пути.
    ///
    /// Возвращает `None`, если файла нет или индекс несовместим. Для записей
    /// старых форматов дозаполняются отсутствующие поля.
    pub(crate) fn load(path: &Path, root: &Path) -> io::Result<Option<Self>> {
        let contents = match fs::read(path) {
            Ok(contents) => contents,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(error),
        };
        let index: Self = serde_json::from_slice(&contents)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        let mut index = index;
        for book in &mut index.books {
            if book.directory.is_empty() {
                book.directory = book
                    .files
                    .first()
                    .and_then(|file| Path::new(&file.path).parent())
                    .map_or_else(String::new, |path| path.to_string_lossy().into_owned());
            }
            if book.metadata_modified == 0 {
                book.metadata_modified =
                    file_modified(&root.join(&book.directory).join("metadata.opf"));
            }
        }
        if !index.validate_root(root) {
            return Ok(None);
        }
        Ok(Some(index))
    }

    /// Атомарное сохранение индекса через временный файл.
    pub(crate) fn save_atomic(&self, path: &Path) -> io::Result<()> {
        let directory = path
            .parent()
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidInput, "индекс без директории"))?;
        fs::create_dir_all(directory)?;
        let temporary = path.with_extension("tmp");
        let contents = serde_json::to_vec_pretty(self)
            .map_err(|error| io::Error::new(io::ErrorKind::InvalidData, error))?;
        fs::write(&temporary, contents)?;
        fs::rename(temporary, path)
    }
}

impl IndexedBook {
    /// Построение записи индекса по результату сканирования.
    fn from_scanned(root: &Path, book: ScannedBook) -> Self {
        let files = book
            .files
            .into_iter()
            .map(|file| IndexedFile::from_scanned(root, file))
            .collect::<Vec<_>>();
        let directory = files
            .first()
            .and_then(|file| Path::new(&file.path).parent())
            .map_or_else(String::new, |path| path.to_string_lossy().into_owned());
        Self {
            metadata_modified: file_modified(&root.join(&directory).join("metadata.opf")),
            directory,
            title: book.title,
            authors: book.authors,
            tags: book.tags,
            series: book.series,
            files,
        }
    }

    /// Преобразование записи индекса в результат сканирования.
    pub(crate) fn scanned(&self) -> ScannedBook {
        ScannedBook {
            title: self.title.clone(),
            authors: self.authors.clone(),
            tags: self.tags.clone(),
            series: self.series.clone(),
            files: self.files.iter().map(IndexedFile::scanned).collect(),
        }
    }
}

impl IndexedFile {
    /// Построение записи файла индекса по результату сканирования.
    fn from_scanned(root: &Path, file: ScannedFile) -> Self {
        let absolute = root.join(&file.path);
        let metadata = fs::metadata(&absolute).ok();
        let modified = metadata
            .as_ref()
            .and_then(|value| value.modified().ok())
            .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
            .map_or(0, |value| value.as_nanos());
        Self {
            kind: match file.kind {
                ScannedFileKind::Book => IndexedFileKind::Book,
                ScannedFileKind::Cover => IndexedFileKind::Cover,
            },
            path: file.path.to_string_lossy().into_owned(),
            format: file.format,
            modified,
            size: metadata.map_or(0, |value| value.len()),
        }
    }

    /// Преобразование записи файла индекса в результат сканирования.
    fn scanned(&self) -> ScannedFile {
        ScannedFile {
            kind: match self.kind {
                IndexedFileKind::Book => ScannedFileKind::Book,
                IndexedFileKind::Cover => ScannedFileKind::Cover,
            },
            path: PathBuf::from(&self.path),
            format: self.format.clone(),
        }
    }
}

/// Путь к JSON-файлу индекса для указанного корня библиотеки.
///
/// Индекс кладётся в папку `.booklib` рядом с исполняемым файлом приложения,
/// имя файла — хеш канонического пути библиотеки.
pub(crate) fn index_path(root: &Path) -> PathBuf {
    let application_directory = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));
    application_directory
        .join(INDEX_DIRECTORY)
        .join(format!("{}.json", path_hash(root)))
}

/// Путь к SQLite-файлу виртуального каталога для указанного корня библиотеки.
pub(crate) fn catalog_path(root: &Path) -> PathBuf {
    index_path(root).with_extension("db")
}

/// Перечисление всех сохранённых индексов библиотек.
///
/// Для каждой записи отмечается, доступна ли исходная директория. Список
/// отсортирован по пути.
pub(crate) fn cached_libraries() -> io::Result<Vec<CachedLibrary>> {
    let directory = index_path(Path::new(".")).parent().map(Path::to_path_buf);
    let Some(directory) = directory else {
        return Ok(Vec::new());
    };
    if !directory.is_dir() {
        return Ok(Vec::new());
    }
    let mut libraries = Vec::new();
    for entry in fs::read_dir(directory)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|extension| extension.to_str()) != Some("json") {
            continue;
        }
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        let Ok(index) = serde_json::from_slice::<LibraryIndex>(&bytes) else {
            continue;
        };
        let root = PathBuf::from(index.root.clone());
        libraries.push(CachedLibrary {
            path: index.root,
            catalog_path: path.with_extension("db"),
            index_path: path,
            available: root.is_dir(),
        });
    }
    libraries.sort_by(|left, right| left.path.cmp(&right.path));
    Ok(libraries)
}

/// SHA-256 хеш канонического пути библиотеки в hex-виде.
fn path_hash(root: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(canonical_string(root).as_bytes());
    format!("{:x}", hasher.finalize())
}

/// Канонический строковый путь; при ошибке — исходный путь без изменений.
fn canonical_string(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

/// Время изменения файла в наносекундах; 0, если метаданные недоступны.
fn file_modified(path: &Path) -> u128 {
    fs::metadata(path)
        .ok()
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |value| value.as_nanos())
}

#[cfg(test)]
#[path = "index_tests.rs"]
mod tests;
