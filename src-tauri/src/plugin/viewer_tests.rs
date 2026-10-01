use super::*;
use crate::test_util;
use crate::test_util::cleanup;
use std::fs;

/// Создание каталога модуля с несколькими файлами.
fn setup_viewer_dir(name: &str) -> std::path::PathBuf {
    let dir = test_util::test_root(&format!("plugin-viewer-{name}"));
    fs::write(dir.join("index.html"), "<html></html>").expect("точка входа");
    fs::create_dir_all(dir.join("assets")).expect("подкаталог");
    fs::write(dir.join("assets").join("pdf.mjs"), "export default 1;").expect("движок");
    fs::write(
        dir.join("assets").join("worker.mjs"),
        "self.onmessage=()=>{};",
    )
    .expect("worker");
    dir
}

#[test]
fn lists_files_with_relative_paths_and_mime() {
    let dir = setup_viewer_dir("list");
    let files = list_files(&dir).expect("перечисление файлов");
    let paths: Vec<&str> = files.iter().map(|file| file.path.as_str()).collect();
    assert_eq!(
        paths,
        vec!["assets/pdf.mjs", "assets/worker.mjs", "index.html"],
        "пути относительные, с разделителем /, по алфавиту"
    );
    assert_eq!(files[0].mime, "text/javascript");
    assert_eq!(files[2].mime, "text/html");
    cleanup(&dir);
}

#[test]
fn reads_file_inside_viewer_dir() {
    let dir = setup_viewer_dir("read");
    let bytes = read_file(&dir, "assets/pdf.mjs").expect("чтение файла модуля");
    assert_eq!(bytes, b"export default 1;");
    cleanup(&dir);
}

#[test]
fn rejects_parent_traversal_path() {
    let dir = setup_viewer_dir("traversal");
    let error = read_file(&dir, "../secret.txt").expect_err("выход за каталог запрещён");
    assert!(
        matches!(error, PluginError::ViewerResource { .. }),
        "небезопасный путь даёт ошибку ресурса модуля"
    );
    cleanup(&dir);
}

#[test]
fn rejects_absolute_path() {
    let dir = setup_viewer_dir("absolute");
    let error = read_file(&dir, "/etc/passwd").expect_err("абсолютный путь запрещён");
    assert!(
        matches!(error, PluginError::ViewerResource { .. }),
        "абсолютный путь даёт ошибку ресурса модуля"
    );
    cleanup(&dir);
}

#[test]
fn mime_for_known_and_unknown_extensions() {
    assert_eq!(mime_for("index.html"), "text/html");
    assert_eq!(mime_for("pdf.mjs"), "text/javascript");
    assert_eq!(mime_for("font.woff2"), "font/woff2");
    assert_eq!(mime_for("data.bin"), "application/octet-stream");
    assert_eq!(mime_for("noext"), "application/octet-stream");
}
