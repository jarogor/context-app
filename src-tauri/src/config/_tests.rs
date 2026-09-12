use super::*;
use crate::test_util;

#[test]
fn default_library_dir_is_inside_project() {
    let config = AppConfig::load().expect("загрузка конфигурации");
    let project_root = project_root();
    assert!(
        config.library_dir.starts_with(&project_root),
        "путь библиотеки внутри рабочей директории"
    );
}

#[test]
fn env_variable_overrides_library_dir() {
    let temp = test_util::test_root("config-env");
    std::env::set_var(crate::constants::LIBRARY_DIR_ENV, temp.as_os_str());
    let config = AppConfig::load().expect("загрузка конфигурации с окружением");
    std::env::remove_var(crate::constants::LIBRARY_DIR_ENV);
    assert_eq!(config.library_dir, temp, "путь из переменной окружения");
    test_util::cleanup(&temp);
}
