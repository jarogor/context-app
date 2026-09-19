use super::*;

#[test]
fn default_library_dir_is_inside_project() {
    let config = AppConfig::load().expect("загрузка конфигурации");
    let project_root = project_root();
    assert!(
        config.library_dir.starts_with(&project_root),
        "путь библиотеки внутри рабочей директории"
    );
}
