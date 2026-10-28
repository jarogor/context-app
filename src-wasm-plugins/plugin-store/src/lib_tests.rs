use super::*;
use crate::host::Host;
use crate::models::PluginEntry;
use std::cell::RefCell;
use std::collections::HashMap;
use std::path::Path;

/// Идентификатор тестового устанавливаемого плагина.
const SAMPLE_ID: &str = "b0000000-0000-4000-8000-000000000001";
/// Идентификатор тестового отключаемого плагина.
const CALIBRE_ID: &str = "f7c8b139-887f-4a2f-84e8-fdcc89635a79";

/// Подставное окружение плагина стора.
struct FakeHost {
    installed: RefCell<Vec<Installed>>,
    installed_paths: RefCell<Vec<String>>,
    plugins: RefCell<Vec<PluginEntry>>,
    state: RefCell<HashMap<String, String>>,
    files: HashMap<String, String>,
    events: RefCell<Vec<String>>,
}

impl FakeHost {
    /// Создание окружения с заданными файлами.
    fn new(files: Vec<(&str, &str)>) -> Self {
        Self {
            installed: RefCell::new(Vec::new()),
            installed_paths: RefCell::new(Vec::new()),
            plugins: RefCell::new(Vec::new()),
            state: RefCell::new(HashMap::new()),
            files: files
                .into_iter()
                .map(|(path, text)| (path.to_string(), text.to_string()))
                .collect(),
            events: RefCell::new(Vec::new()),
        }
    }

    /// Добавление плагина в перечень.
    fn with_plugin(self, id: &str, name: &str, enabled: bool, removable: bool) -> Self {
        self.plugins.borrow_mut().push(PluginEntry {
            id: id.to_string(),
            name: name.to_string(),
            version: "0.1.0".to_string(),
            kind: "source".to_string(),
            description: "тест".to_string(),
            enabled,
            removable,
            sample: false,
        });
        self
    }

    /// Представление плагина, извлекаемое из пути к пакету.
    fn artifact(path: &str) -> Installed {
        let name = Path::new(path)
            .file_stem()
            .and_then(|stem| stem.to_str())
            .unwrap_or("unknown")
            .to_string();
        Installed {
            id: SAMPLE_ID.to_string(),
            name,
            version: "0.1.0".to_string(),
            kind: "extension".to_string(),
            contract_version: 1,
            description: String::new(),
        }
    }
}

impl host_sdk::Host for FakeHost {
    fn state_read(&self, key: &str) -> Result<Option<String>, String> {
        Ok(self.state.borrow().get(key).cloned())
    }

    fn state_write(&self, key: &str, value: &str) -> Result<(), String> {
        self.state
            .borrow_mut()
            .insert(key.to_string(), value.to_string());
        Ok(())
    }

    fn emit_event(&self, name: &str, payload: &str) -> Result<(), String> {
        self.events.borrow_mut().push(format!("{name}:{payload}"));
        Ok(())
    }
}

impl Host for FakeHost {
    fn store_inspect(&self, path: &str) -> Result<Installed, String> {
        Ok(Self::artifact(path))
    }

    fn store_install(&self, path: &str) -> Result<Installed, String> {
        self.installed_paths.borrow_mut().push(path.to_string());
        let item = Self::artifact(path);
        self.installed.borrow_mut().push(item.clone());
        Ok(item)
    }

    fn store_uninstall(&self, id: &str) -> Result<(), String> {
        let mut list = self.installed.borrow_mut();
        let Some(position) = list.iter().position(|item| item.id == id) else {
            return Err(format!("плагин {id} не установлен"));
        };
        list.remove(position);
        Ok(())
    }

    fn store_installed(&self) -> Result<Vec<Installed>, String> {
        Ok(self.installed.borrow().clone())
    }

    fn store_plugins(&self) -> Result<Vec<PluginEntry>, String> {
        Ok(self.plugins.borrow().clone())
    }

    fn store_set_enabled(&self, id: &str, enabled: bool) -> Result<(), String> {
        let mut plugins = self.plugins.borrow_mut();
        let Some(entry) = plugins.iter_mut().find(|entry| entry.id == id) else {
            return Err(format!("плагин {id} не отключаем"));
        };
        entry.enabled = enabled;
        Ok(())
    }

    fn store_read(&self, kind: &str, location: &str, relative: &str) -> Result<String, String> {
        let path = if kind == "network" {
            format!("network:{}/{}", location.trim_end_matches('/'), relative)
        } else {
            format!("{}/{}", location.trim_end_matches('/'), relative)
        };
        self.read_file_text(&path)
    }

    fn store_fetch(
        &self,
        kind: &str,
        location: &str,
        relative: &str,
        _sha256: Option<&str>,
    ) -> Result<String, String> {
        if kind == "network" {
            return Ok(format!("/downloaded/{relative}"));
        }
        Ok(format!("{}/{}", location.trim_end_matches('/'), relative))
    }

    fn read_file_text(&self, path: &str) -> Result<String, String> {
        self.files
            .get(path)
            .cloned()
            .ok_or_else(|| format!("файл {path} не найден"))
    }
}

/// Вызов действия плагина и разбор JSON-ответа.
fn call(host: &FakeHost, action: &str, payload: serde_json::Value) -> serde_json::Value {
    let input = json!({ "action": action, "payload": payload }).to_string();
    let output = handle(host, &input).expect("действие выполнено");
    serde_json::from_str(&output).expect("JSON-ответ")
}

#[test]
fn capabilities_lists_providers() {
    let host = FakeHost::new(vec![]);
    let response = call(&host, "capabilities", json!({}));
    assert_eq!(response["contract"], PROVIDER_CONTRACT);
    assert_eq!(response["providers"][0], "file");
    assert_eq!(response["providers"][1], "network");
}

#[test]
fn install_file_installs_and_emits() {
    let host = FakeHost::new(vec![]);
    let response = call(&host, "install_file", json!({ "path": "/tmp/sample.zip" }));
    assert_eq!(response["plugin"]["name"], "sample");
    assert_eq!(
        host.installed_paths.borrow().as_slice(),
        ["/tmp/sample.zip"]
    );
    assert!(
        host.events
            .borrow()
            .iter()
            .any(|event| event.contains(EVENT_CHANGED)),
        "событие об изменении опубликовано"
    );
}

#[test]
fn install_file_requires_path() {
    let host = FakeHost::new(vec![]);
    let input = json!({ "action": "install_file", "payload": {} }).to_string();
    assert!(
        handle(&host, &input).is_err(),
        "без пути установка отклоняется"
    );
}

#[test]
fn uninstall_removes_installed() {
    let host = FakeHost::new(vec![]);
    call(&host, "install_file", json!({ "path": "/tmp/sample.zip" }));
    let response = call(&host, "uninstall", json!({ "id": SAMPLE_ID }));
    assert_eq!(response["removed"], SAMPLE_ID);
    assert!(host.installed.borrow().is_empty(), "плагин удалён");

    let input = json!({ "action": "uninstall", "payload": { "id": "missing" } }).to_string();
    assert!(
        handle(&host, &input).is_err(),
        "удаление неизвестного отклоняется"
    );
}

#[test]
fn stores_add_list_remove_persists() {
    let host = FakeHost::new(vec![]);
    let store = json!({
        "id": "local",
        "kind": "file",
        "title": "Локальный",
        "location": "/store"
    });
    let response = call(&host, "stores_add", json!({ "store": store }));
    assert_eq!(response["stores"][0]["id"], "local");
    assert!(
        host.state.borrow().contains_key(STATE_KEY),
        "реестр сохранён в служебном состоянии"
    );

    let listed = call(&host, "stores_list", json!({}));
    assert_eq!(listed["stores"].as_array().map(Vec::len), Some(1));

    let removed = call(&host, "stores_remove", json!({ "id": "local" }));
    assert_eq!(removed["stores"].as_array().map(Vec::len), Some(0));
}

#[test]
fn stores_add_rejects_duplicate_and_bad_kind() {
    let host = FakeHost::new(vec![]);
    let store = json!({ "id": "local", "kind": "file", "title": "Л", "location": "/s" });
    call(&host, "stores_add", json!({ "store": store.clone() }));

    let duplicate = json!({ "action": "stores_add", "payload": { "store": store } }).to_string();
    assert!(
        handle(&host, &duplicate).is_err(),
        "дубликат id отклоняется"
    );

    let bad = json!({
        "action": "stores_add",
        "payload": { "store": { "id": "x", "kind": "ftp", "title": "X", "location": "" } }
    })
    .to_string();
    assert!(
        handle(&host, &bad).is_err(),
        "неизвестный вид провайдера отклоняется"
    );
}

#[test]
fn available_file_reads_index() {
    let index = json!({
        "packages": [
            { "name": "sample", "version": "1.0", "kind": "extension", "description": "d", "location": "sample.zip" }
        ]
    })
    .to_string();
    let host = FakeHost::new(vec![("/store/store-index.json", &index)]);
    call(
        &host,
        "stores_add",
        json!({ "store": { "id": "local", "kind": "file", "title": "L", "location": "/store" } }),
    );

    let response = call(&host, "available", json!({ "id": "local" }));
    assert_eq!(response["supported"], true);
    assert_eq!(response["packages"][0]["name"], "sample");
}

#[test]
fn available_network_reads_index() {
    let index = json!({
        "packages": [
            { "id": SAMPLE_ID, "name": "sample", "version": "1.0.0", "location": "sample.zip", "sha256": "abc" }
        ]
    })
    .to_string();
    let host = FakeHost::new(vec![(
        "network:https://example.com/store-index.json",
        &index,
    )]);
    call(
        &host,
        "stores_add",
        json!({ "store": { "id": "remote", "kind": "network", "title": "R", "location": "https://example.com" } }),
    );

    let response = call(&host, "available", json!({ "id": "remote" }));
    assert_eq!(response["supported"], true);
    assert_eq!(response["packages"][0]["name"], "sample");
}

#[test]
fn install_from_store_file_uses_joined_path() {
    let index = json!({
        "packages": [
            { "name": "sample", "location": "packages/sample.zip" }
        ]
    })
    .to_string();
    let host = FakeHost::new(vec![("/store/store-index.json", &index)]);
    call(
        &host,
        "stores_add",
        json!({ "store": { "id": "local", "kind": "file", "title": "L", "location": "/store/" } }),
    );

    let response = call(
        &host,
        "install_from_store",
        json!({ "id": "local", "name": "sample" }),
    );
    assert_eq!(response["plugin"]["name"], "sample");
    assert_eq!(
        host.installed_paths.borrow().as_slice(),
        ["/store/packages/sample.zip"]
    );
}

#[test]
fn install_from_store_network_fetches_package() {
    let index = json!({
        "packages": [
            { "id": SAMPLE_ID, "name": "sample", "version": "1.0.0", "location": "packages/sample.zip", "sha256": "abc" }
        ]
    })
    .to_string();
    let host = FakeHost::new(vec![(
        "network:https://example.com/store-index.json",
        &index,
    )]);
    call(
        &host,
        "stores_add",
        json!({ "store": { "id": "remote", "kind": "network", "title": "R", "location": "https://example.com" } }),
    );

    let response = call(
        &host,
        "install_from_store",
        json!({ "id": "remote", "name": "sample" }),
    );
    assert_eq!(response["plugin"]["name"], "sample");
    assert_eq!(
        host.installed_paths.borrow().as_slice(),
        ["/downloaded/packages/sample.zip"]
    );
}

#[test]
fn updates_lists_newer_packages() {
    let index = json!({
        "packages": [
            { "id": SAMPLE_ID, "name": "sample", "version": "1.1.0", "location": "sample.zip" }
        ]
    })
    .to_string();
    let host = FakeHost::new(vec![("/store/store-index.json", &index)])
        .with_plugin(SAMPLE_ID, "sample", true, true);
    call(
        &host,
        "stores_add",
        json!({ "store": { "id": "local", "kind": "file", "title": "L", "location": "/store" } }),
    );

    let response = call(&host, "updates", json!({}));
    assert_eq!(response["updates"][0]["name"], "sample");
    assert_eq!(response["updates"][0]["current_version"], "0.1.0");
}

#[test]
fn updates_ignores_same_version() {
    let index = json!({
        "packages": [
            { "id": SAMPLE_ID, "name": "sample", "version": "0.1.0", "location": "sample.zip" }
        ]
    })
    .to_string();
    let host = FakeHost::new(vec![("/store/store-index.json", &index)])
        .with_plugin(SAMPLE_ID, "sample", true, true);
    call(
        &host,
        "stores_add",
        json!({ "store": { "id": "local", "kind": "file", "title": "L", "location": "/store" } }),
    );

    let response = call(&host, "updates", json!({}));
    assert!(response["updates"].as_array().map(Vec::len) == Some(0));
}

#[test]
fn plugins_lists_catalog() {
    let host = FakeHost::new(vec![]).with_plugin(CALIBRE_ID, "calibre", true, false);

    let response = call(&host, "plugins", json!({}));

    assert_eq!(response["plugins"][0]["id"], CALIBRE_ID);
    assert_eq!(response["plugins"][0]["name"], "calibre");
    assert_eq!(response["plugins"][0]["enabled"], true);
    assert_eq!(response["plugins"][0]["removable"], false);
}

#[test]
fn set_enabled_toggles_and_emits() {
    let host = FakeHost::new(vec![]).with_plugin(CALIBRE_ID, "calibre", true, false);

    let response = call(
        &host,
        "set_enabled",
        json!({ "id": CALIBRE_ID, "enabled": false }),
    );

    assert_eq!(response["enabled"], false);
    let listed = call(&host, "plugins", json!({}));
    assert_eq!(listed["plugins"][0]["enabled"], false);
    assert!(
        host.events
            .borrow()
            .iter()
            .any(|event| event.contains(EVENT_CHANGED)),
        "событие об изменении активности опубликовано"
    );
}

#[test]
fn set_enabled_unknown_is_error() {
    let host = FakeHost::new(vec![]);
    let input = json!({
        "action": "set_enabled",
        "payload": { "id": "missing", "enabled": false }
    })
    .to_string();

    assert!(handle(&host, &input).is_err());
}
