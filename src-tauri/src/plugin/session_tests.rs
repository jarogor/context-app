use std::path::PathBuf;

use super::PluginSession;
use crate::test_util;

#[test]
fn writable_root_is_created_before_plugin_configuration() {
    let parent = test_util::test_root("plugin-session-writable-root");
    let root = parent.join("nested").join("runtime-root");
    let bundled = parent.join("plugins");
    let storage = parent.join("state");
    let mut session = PluginSession::idle(PathBuf::from("."), bundled, storage);

    session
        .configure(&root, "test-plugin".to_string(), true)
        .expect("настройка writable plugin root");

    assert!(root.is_dir(), "writable root создан до настройки sandbox");
    assert_eq!(session.root(), root);
    test_util::cleanup(&parent);
}
