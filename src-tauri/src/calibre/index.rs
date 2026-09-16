//! Локальный индекс внешней библиотеки Calibre.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

use super::scanner::{ScannedBook, ScannedFile, ScannedFileKind};

const INDEX_VERSION: u32 = 3;
const INDEX_DIRECTORY: &str = ".booklib";

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct LibraryIndex {
    version: u32,
    root: String,
    pub books: Vec<IndexedBook>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CachedLibrary {
    pub path: String,
    pub index_path: PathBuf,
    pub catalog_path: PathBuf,
    pub available: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct IndexedBook {
    #[serde(default)]
    pub directory: String,
    #[serde(default)]
    pub metadata_modified: u128,
    pub title: String,
    pub authors: Vec<String>,
    pub tags: Vec<String>,
    pub series: Vec<(String, i64)>,
    pub files: Vec<IndexedFile>,
}

#[derive(Debug, Serialize, Deserialize)]
pub(crate) struct IndexedFile {
    pub kind: IndexedFileKind,
    pub path: String,
    pub format: String,
    pub modified: u128,
    pub size: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub(crate) enum IndexedFileKind {
    Book,
    Cover,
}

impl LibraryIndex {
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

    pub(crate) fn validate_root(&self, root: &Path) -> bool {
        self.version == INDEX_VERSION && self.root == canonical_string(root)
    }

    pub(crate) fn scanned_books(&self) -> Vec<ScannedBook> {
        self.books.iter().map(IndexedBook::scanned).collect()
    }

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

pub(crate) fn index_path(root: &Path) -> PathBuf {
    let application_directory = std::env::current_exe()
        .ok()
        .and_then(|path| path.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));
    application_directory
        .join(INDEX_DIRECTORY)
        .join(format!("{}.json", path_hash(root)))
}

pub(crate) fn catalog_path(root: &Path) -> PathBuf {
    index_path(root).with_extension("db")
}

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

fn path_hash(root: &Path) -> String {
    let mut hasher = Sha256::new();
    hasher.update(canonical_string(root).as_bytes());
    format!("{:x}", hasher.finalize())
}

fn canonical_string(path: &Path) -> String {
    path.canonicalize()
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .into_owned()
}

fn file_modified(path: &Path) -> u128 {
    fs::metadata(path)
        .ok()
        .and_then(|value| value.modified().ok())
        .and_then(|value| value.duration_since(std::time::UNIX_EPOCH).ok())
        .map_or(0, |value| value.as_nanos())
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::{index_path, LibraryIndex};
    use crate::calibre::scanner;
    use crate::test_util;

    #[test]
    fn uses_stable_hash_for_same_root() {
        let root = test_util::test_root("index-path");
        assert_eq!(index_path(&root), index_path(&root));
        assert!(index_path(&root).to_string_lossy().contains(".booklib"));
    }

    #[test]
    fn saves_and_loads_index_atomically() {
        let root = test_util::test_root("index-roundtrip");
        test_util::cleanup(&root);
        let book = root.join("Автор").join("Книга (1)");
        fs::create_dir_all(&book).expect("создание книги");
        fs::write(book.join("book.epub"), "epub").expect("создание файла");
        let index = LibraryIndex::from_scanned(&root, scanner::scan(&root).expect("сканирование"));
        let path = root.join("cache").join("index.json");
        index.save_atomic(&path).expect("сохранение индекса");
        let loaded = LibraryIndex::load(&path, &root)
            .expect("чтение индекса")
            .expect("индекс существует");
        assert_eq!(loaded.books.len(), 1);
        fs::write(&path, "broken").expect("повреждение индекса");
        assert!(LibraryIndex::load(&path, &root).is_err());
        test_util::cleanup(&root);
    }

    #[test]
    fn replaces_only_changed_book_directory() {
        let root = test_util::test_root("index-partial-update");
        test_util::cleanup(&root);
        let first = root.join("Автор").join("Первая (1)");
        let second = root.join("Автор").join("Вторая (2)");
        fs::create_dir_all(&first).expect("создание первой книги");
        fs::create_dir_all(&second).expect("создание второй книги");
        fs::write(first.join("first.epub"), "first").expect("первая книга");
        fs::write(second.join("second.epub"), "second").expect("вторая книга");
        let mut index = LibraryIndex::from_scanned(
            &root,
            scanner::scan(&root).expect("первичное сканирование"),
        );
        fs::remove_file(first.join("first.epub")).expect("удаление первой книги");
        fs::write(first.join("replacement.epub"), "replacement").expect("новый файл");
        let changed = index.changed_directories(&root);
        index
            .replace_directories(&root, &changed)
            .expect("частичное обновление");
        assert_eq!(index.books.len(), 2);
        assert!(index.books.iter().any(|book| {
            book.files
                .iter()
                .any(|file| file.path.ends_with("replacement.epub"))
        }));
        test_util::cleanup(&root);
    }
}
