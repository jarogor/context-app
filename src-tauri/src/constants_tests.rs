use super::*;

#[test]
fn user_plugins_dir_name_is_stable() {
    assert_eq!(USER_PLUGINS_DIR_NAME, "app-plugins");
}

#[test]
fn debug_root_is_under_dev_data() {
    let path = resolve_user_plugins_root(None);
    assert!(
        path.ends_with(PathBuf::from("dev_data").join(USER_PLUGINS_DIR_NAME)),
        "в debug каталог плагинов лежит в dev_data: {}",
        path.display()
    );
}

#[test]
fn provided_app_data_is_ignored_in_debug() {
    let app_data = PathBuf::from("/tmp/app-data");
    let path = resolve_user_plugins_root(Some(&app_data));
    assert!(
        path.ends_with(PathBuf::from("dev_data").join(USER_PLUGINS_DIR_NAME)),
        "в debug внешний каталог данных не используется"
    );
}
