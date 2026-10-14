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

#[test]
fn webview_dir_name_is_stable() {
    assert_eq!(WEBVIEW_DIR_NAME, "webview");
}

#[test]
fn webview_root_lives_inside_state_root() {
    let state_root = PathBuf::from("/data/app-state");
    let webview = resolve_webview_root(&state_root);

    assert_eq!(webview, PathBuf::from("/data/app-state/webview"));
    assert!(
        webview.starts_with(&state_root),
        "данные webview не выходят за каталог состояния"
    );
}

#[test]
fn webview_root_follows_build_state_root() {
    let state_root = resolve_app_state_root(None);
    let webview = resolve_webview_root(&state_root);

    assert_eq!(webview, state_root.join(WEBVIEW_DIR_NAME));
    assert!(
        webview.ends_with(
            PathBuf::from("dev_data")
                .join(APP_STATE_DIR_NAME)
                .join(WEBVIEW_DIR_NAME)
        ),
        "в debug каталог webview лежит в dev_data/app-state/webview: {}",
        webview.display()
    );
}
