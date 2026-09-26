use super::*;
use crate::plugin::PluginRuntime;
use crate::test_util;
use std::io::Write;
use zip::write::SimpleFileOptions;
use zip::ZipWriter;

/// WAT-модуль, экспортирующий функцию `invoke`.
const WAT_WITH_INVOKE: &str = r#"
    (module
      (func (export "invoke") (result i32)
        i32.const 0))
  "#;

/// Валидный WASM-заменитель: для установки достаточно существования файла.
const FAKE_WASM: &[u8] = b"fake-wasm";

/// Идентификатор тестового плагина `sample`.
const SAMPLE_ID: &str = "b0000000-0000-4000-8000-000000000001";
/// Идентификатор тестового плагина `settings`.
const SETTINGS_ID: &str = "b0000000-0000-4000-8000-000000000002";

/// Создание zip-пакета с указанными записями.
fn write_package(path: &Path, entries: &[(&str, &[u8])]) {
    let file = File::create(path).expect("создание пакета");
    let mut zip = ZipWriter::new(file);
    for (name, bytes) in entries {
        zip.start_file(*name, SimpleFileOptions::default())
            .expect("запись файла пакета");
        zip.write_all(bytes).expect("данные файла пакета");
    }
    zip.finish().expect("завершение пакета");
}

/// Манифест extension-плагина с указанным идентификатором, именем и модулем.
fn manifest(id: &str, name: &str, module: &str) -> String {
    format!(
        r#"{{
          "contract_version": 1,
          "kind": "extension",
          "id": "{id}",
          "name": "{name}",
          "description": "Тестовый пакет",
          "module": "{module}",
          "export": "invoke",
          "host_functions": []
        }}"#
    )
}

/// Пакет с манифестом и модулем.
fn valid_package(path: &Path, id: &str, name: &str) {
    write_package(
        path,
        &[
            (
                "plugin-manifest.json",
                manifest(id, name, "plugin.wasm").as_bytes(),
            ),
            ("plugin.wasm", FAKE_WASM),
        ],
    );
}

#[test]
fn inspects_valid_package() {
    let root = test_util::test_root("plugin-package-inspect");
    let archive = root.join("pkg.zip");
    valid_package(&archive, SAMPLE_ID, "sample");

    let manifest = inspect_package(&archive).expect("инспекция пакета");
    assert_eq!(manifest.id, SAMPLE_ID);
    assert_eq!(manifest.name, "sample");
    assert_eq!(manifest.module, "plugin.wasm");
    test_util::cleanup(&root);
}

#[test]
fn rejects_package_without_manifest() {
    let root = test_util::test_root("plugin-package-no-manifest");
    let archive = root.join("pkg.zip");
    write_package(&archive, &[("plugin.wasm", FAKE_WASM)]);

    let result = inspect_package(&archive);
    assert!(
        matches!(result, Err(PluginError::Package { .. })),
        "пакет без манифеста отклоняется"
    );
    test_util::cleanup(&root);
}

#[test]
fn rejects_unsupported_contract_version() {
    let root = test_util::test_root("plugin-package-bad-contract");
    let archive = root.join("pkg.zip");
    let body = r#"{
      "contract_version": 99,
      "id": "b0000000-0000-4000-8000-000000000001",
      "name": "sample",
      "description": "Тест",
      "module": "plugin.wasm",
      "export": "invoke",
      "host_functions": []
    }"#;
    write_package(
        &archive,
        &[
            ("plugin-manifest.json", body.as_bytes()),
            ("plugin.wasm", FAKE_WASM),
        ],
    );

    let result = inspect_package(&archive);
    assert!(
        matches!(result, Err(PluginError::UnsupportedContract { .. })),
        "неподдерживаемая версия контракта отклоняется"
    );
    test_util::cleanup(&root);
}

#[test]
fn installs_and_lists_package() {
    let dir = test_util::test_root("plugin-package-install");
    let archive = dir.join("pkg.zip");
    let root = dir.join("app-plugins");
    valid_package(&archive, SAMPLE_ID, "sample");

    let installed = install_package(&archive, &root).expect("установка пакета");
    assert_eq!(installed.id, SAMPLE_ID);
    assert_eq!(installed.name, "sample");
    assert_eq!(installed.kind, "extension");
    assert!(
        root.join(SAMPLE_ID).join("plugin.wasm").is_file(),
        "модуль распакован под идентификатором"
    );

    let list = installed_plugins(&root).expect("список установленных");
    assert_eq!(list.len(), 1);
    assert_eq!(list[0].id, SAMPLE_ID);
    assert_eq!(list[0].name, "sample");
    test_util::cleanup(&dir);
}

#[test]
fn rejects_duplicate_install() {
    let dir = test_util::test_root("plugin-package-duplicate");
    let archive = dir.join("pkg.zip");
    let root = dir.join("app-plugins");
    valid_package(&archive, SAMPLE_ID, "sample");
    install_package(&archive, &root).expect("первая установка");

    let result = install_package(&archive, &root);
    assert!(
        matches!(result, Err(PluginError::Package { .. })),
        "повторная установка отклоняется"
    );
    test_util::cleanup(&dir);
}

#[test]
fn rejects_base_plugin_package() {
    let dir = test_util::test_root("plugin-package-base");
    let archive = dir.join("pkg.zip");
    let root = dir.join("app-plugins");
    let body = r#"{
      "contract_version": 1,
      "kind": "base",
      "id": "b0000000-0000-4000-8000-000000000002",
      "name": "settings",
      "description": "Тест",
      "module": "plugin.wasm",
      "export": "invoke",
      "host_functions": []
    }"#;
    write_package(
        &archive,
        &[
            ("plugin-manifest.json", body.as_bytes()),
            ("plugin.wasm", FAKE_WASM),
        ],
    );

    let result = install_package(&archive, &root);
    assert!(
        matches!(result, Err(PluginError::Package { .. })),
        "базовый плагин через стор не устанавливается"
    );
    assert!(!root.join(SETTINGS_ID).exists(), "файлы не созданы");
    test_util::cleanup(&dir);
}

#[test]
fn rejects_package_without_module() {
    let dir = test_util::test_root("plugin-package-no-module");
    let archive = dir.join("pkg.zip");
    let root = dir.join("app-plugins");
    write_package(
        &archive,
        &[(
            "plugin-manifest.json",
            manifest(SAMPLE_ID, "sample", "plugin.wasm").as_bytes(),
        )],
    );

    let result = install_package(&archive, &root);
    assert!(
        matches!(result, Err(PluginError::Package { .. })),
        "отсутствие модуля отклоняется"
    );
    test_util::cleanup(&dir);
}

#[test]
fn rejects_zip_slip_entry() {
    let dir = test_util::test_root("plugin-package-slip");
    let archive = dir.join("pkg.zip");
    let root = dir.join("app-plugins");
    fs::create_dir_all(&root).expect("создание каталога плагинов");
    write_package(
        &archive,
        &[
            (
                "plugin-manifest.json",
                manifest(SAMPLE_ID, "sample", "plugin.wasm").as_bytes(),
            ),
            ("plugin.wasm", FAKE_WASM),
            ("../escaped.txt", b"escape"),
        ],
    );

    let result = install_package(&archive, &root);
    assert!(
        matches!(result, Err(PluginError::Package { .. })),
        "запись вне каталога установки отклоняется"
    );
    assert!(
        !dir.join("escaped.txt").exists(),
        "файл не появился вне цели"
    );
    test_util::cleanup(&dir);
}

#[test]
fn uninstalls_only_installed_plugin() {
    let dir = test_util::test_root("plugin-package-uninstall");
    let archive = dir.join("pkg.zip");
    let root = dir.join("app-plugins");
    valid_package(&archive, SAMPLE_ID, "sample");
    install_package(&archive, &root).expect("установка");

    uninstall_package(SAMPLE_ID, &root).expect("удаление");
    assert!(!root.join(SAMPLE_ID).exists(), "каталог плагина удалён");
    assert!(
        installed_plugins(&root).expect("список").is_empty(),
        "список пуст после удаления"
    );

    let result = uninstall_package(SETTINGS_ID, &root);
    assert!(
        matches!(result, Err(PluginError::Package { .. })),
        "неустановленный (базовый) плагин не удаляется"
    );
    test_util::cleanup(&dir);
}

#[test]
fn missing_root_lists_no_plugins() {
    let dir = test_util::test_root("plugin-package-missing-root");
    let root = dir.join("does-not-exist");
    let list = installed_plugins(&root).expect("список отсутствующего каталога");
    assert!(list.is_empty(), "нет установленных плагинов");
    test_util::cleanup(&dir);
}

#[test]
fn install_does_not_modify_bundled_resources() {
    let dir = test_util::test_root("plugin-package-bundled-untouched");
    let bundled = dir.join("bundled");
    fs::create_dir_all(bundled.join("sample")).expect("поставляемые ресурсы");
    let bundled_manifest = bundled.join("sample").join("plugin-manifest.json");
    fs::write(&bundled_manifest, b"{\"name\":\"bundled\"}").expect("файл ресурса");
    let before = fs::read(&bundled_manifest).expect("чтение до установки");

    let archive = dir.join("pkg.zip");
    valid_package(&archive, SAMPLE_ID, "sample");
    let root = dir.join("app-plugins");
    install_package(&archive, &root).expect("установка пакета");

    let after = fs::read(&bundled_manifest).expect("чтение после установки");
    assert_eq!(before, after, "поставляемые ресурсы не изменяются");
    test_util::cleanup(&dir);
}

#[test]
fn installed_plugin_loads_and_uninstall_removes() {
    let dir = test_util::test_root("plugin-package-end-to-end");
    let archive = dir.join("pkg.zip");
    let wasm = wat::parse_str(WAT_WITH_INVOKE).expect("компиляция WAT");
    write_package(
        &archive,
        &[
            (
                "plugin-manifest.json",
                manifest(SAMPLE_ID, "sample", "plugin.wasm").as_bytes(),
            ),
            ("plugin.wasm", &wasm),
        ],
    );
    let root = dir.join("app-plugins");
    install_package(&archive, &root).expect("установка пакета");

    let runtime =
        PluginRuntime::load(std::slice::from_ref(&root), dir.clone()).expect("загрузка runtime");
    assert!(
        runtime.plugin_names().contains(&"sample".to_string()),
        "установленный плагин загружается из пользовательского каталога"
    );

    uninstall_package(SAMPLE_ID, &root).expect("удаление пакета");
    let runtime =
        PluginRuntime::load(std::slice::from_ref(&root), dir.clone()).expect("повторная загрузка");
    assert!(
        runtime.plugin_names().is_empty(),
        "после удаления плагин больше не загружается"
    );
    test_util::cleanup(&dir);
}
