//! Базовый плагин стора плагинов приложения «Контекст».
//!
//! Управляет установкой, обновлением и удалением пакетов плагинов через
//! привилегированные host-функции ядра, владеет реестром подключённых сторов и
//! предоставляет контракт поставщика с файловым и сетевым провайдерами.

pub mod host;
pub mod models;

#[cfg(target_arch = "wasm32")]
mod wasm;

use serde_json::json;

use host_sdk::state;
use host_sdk::Request;

use crate::host::Host;
use crate::models::{Installed, Package, Store, StoreIndex, StoreState};

/// Ключ служебного состояния с реестром сторов.
const STATE_KEY: &str = "stores.json";

/// Имя файла индекса пакетов внутри стора.
const INDEX_FILE: &str = "store-index.json";

/// Каталог обновлений внутри каталога данных приложения.
const UPDATES_DIR_NAME: &str = "updates";

/// Версия контракта поставщика стора.
const PROVIDER_CONTRACT: &str = "plugin-store.provider@1";

/// Имя прикладного события об изменении состава установленных плагинов.
const EVENT_CHANGED: &str = "plugin-store:changed";

/// Диспетчеризация действий плагина стора.
pub fn handle(host: &impl Host, input: &str) -> Result<String, String> {
    let request = Request::parse(input)?;
    match request.action.as_str() {
        "capabilities" => Ok(capabilities()),
        "list" => list(host),
        "plugins" => plugins(host),
        "set_enabled" => set_enabled(host, &request.payload),
        "install_file" => install_file(host, &request.payload),
        "uninstall" => uninstall(host, &request.payload),
        "stores_list" => stores_list(host),
        "stores_add" => stores_add(host, &request.payload),
        "stores_remove" => stores_remove(host, &request.payload),
        "available" => available(host, &request.payload),
        "install_from_store" => install_from_store(host, &request.payload),
        "updates" => updates(host),
        other => Err(format!("неизвестное действие плагина стора: {other}")),
    }
}

/// Описание возможностей плагина стора.
fn capabilities() -> String {
    json!({
        "contract": PROVIDER_CONTRACT,
        "providers": ["file", "network"],
    })
    .to_string()
}

/// Список установленных плагинов.
fn list(host: &impl Host) -> Result<String, String> {
    let plugins = host.store_installed()?;
    Ok(json!({ "plugins": plugins }).to_string())
}

/// Перечень отключаемых плагинов с активностью.
fn plugins(host: &impl Host) -> Result<String, String> {
    let plugins = host.store_plugins()?;
    Ok(json!({ "plugins": plugins }).to_string())
}

/// Переключение активности плагина.
fn set_enabled(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = required_str(payload, "id")?;
    let enabled = payload
        .get("enabled")
        .and_then(|value| value.as_bool())
        .ok_or_else(|| "не указано поле enabled".to_string())?;
    host.store_set_enabled(&id, enabled)?;
    host.emit_event(
        EVENT_CHANGED,
        &json!({ "id": id, "enabled": enabled }).to_string(),
    )?;
    Ok(json!({ "id": id, "enabled": enabled }).to_string())
}

/// Установка пакета из выбранного пользователем zip-файла.
fn install_file(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let path = required_str(payload, "path")?;
    let plugin = host.store_install(&path)?;
    emit_changed(host, &plugin)?;
    Ok(json!({ "plugin": plugin }).to_string())
}

/// Удаление установленного плагина.
fn uninstall(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = required_str(payload, "id")?;
    host.store_uninstall(&id)?;
    host.emit_event(EVENT_CHANGED, &json!({ "removed": id }).to_string())?;
    Ok(json!({ "removed": id }).to_string())
}

/// Список подключённых сторов.
fn stores_list(host: &impl Host) -> Result<String, String> {
    let state = load_state(host)?;
    Ok(json!({ "stores": state.stores }).to_string())
}

/// Добавление стора в реестр.
fn stores_add(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let store: Store = payload
        .get("store")
        .cloned()
        .map(serde_json::from_value)
        .transpose()
        .map_err(|error| format!("некорректный стор: {error}"))?
        .ok_or_else(|| "не указан стор".to_string())?;
    if store.id.trim().is_empty() {
        return Err("идентификатор стора не может быть пустым".to_string());
    }
    if !matches!(store.kind.as_str(), "file" | "network") {
        return Err(format!("неизвестный вид провайдера: {}", store.kind));
    }
    let mut state = load_state(host)?;
    if state.stores.iter().any(|item| item.id == store.id) {
        return Err(format!("стор с идентификатором {} уже подключён", store.id));
    }
    state.stores.push(store);
    save_state(host, &state)?;
    Ok(json!({ "stores": state.stores }).to_string())
}

/// Удаление стора из реестра.
fn stores_remove(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = required_str(payload, "id")?;
    let mut state = load_state(host)?;
    state.stores.retain(|store| store.id != id);
    save_state(host, &state)?;
    Ok(json!({ "stores": state.stores }).to_string())
}

/// Список пакетов, предлагаемых стором.
fn available(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = required_str(payload, "id")?;
    let store = find_store(host, &id)?;
    let index = load_index(host, &store)?;
    Ok(json!({ "supported": true, "packages": index.packages }).to_string())
}

/// Установка пакета, предлагаемого стором.
fn install_from_store(host: &impl Host, payload: &serde_json::Value) -> Result<String, String> {
    let id = required_str(payload, "id")?;
    let name = required_str(payload, "name")?;
    let store = find_store(host, &id)?;
    let index = load_index(host, &store)?;
    let package = index
        .packages
        .iter()
        .find(|package| package.name == name)
        .ok_or_else(|| format!("пакет {name} не найден в сторе {id}"))?;
    let path = host.store_fetch(
        &store.kind,
        &store.location,
        &package.location,
        package.sha256.as_deref(),
    )?;
    let plugin = host.store_install(&path)?;
    emit_changed(host, &plugin)?;
    Ok(json!({ "plugin": plugin }).to_string())
}

/// Список доступных обновлений установленных прикладных плагинов.
fn updates(host: &impl Host) -> Result<String, String> {
    let installed = host.store_plugins()?;
    let mut updates = Vec::new();
    let mut errors = Vec::new();
    for store in load_state(host)?.stores {
        let index = match load_index(host, &store) {
            Ok(index) => index,
            Err(error) => {
                // В сообщении — расположение места, а не его служебный
                // идентификатор: по идентификатору пользователь не поймёт, о
                // каком из добавленных мест речь.
                errors.push(format!("{}: {error}", store_display(&store)));
                continue;
            }
        };
        for package in index.packages {
            let Some(current) = installed
                .iter()
                .find(|plugin| package_matches(&package, &plugin.id, &plugin.name))
            else {
                continue;
            };
            if package.version.trim().is_empty() {
                continue;
            }
            if !is_newer(&current.version, &package.version) {
                continue;
            }
            updates.push(json!({
                "store": store.id,
                "name": package.name,
                "package": package,
                "current_version": current.version,
            }));
        }
    }
    Ok(json!({ "updates": updates, "errors": errors }).to_string())
}

/// Человекочитаемое название места для сообщений.
///
/// Служебный идентификатор (`updates-mvs9zo6g-…`) ничего не говорит
/// пользователю, поэтому берётся подпись, а если её нет — расположение.
fn store_display(store: &Store) -> &str {
    let title = store.title.trim();
    if title.is_empty() {
        store.location.trim()
    } else {
        title
    }
}

/// Признак соответствия пакета установленному плагину.
fn package_matches(package: &Package, id: &str, name: &str) -> bool {
    if !package.id.trim().is_empty() {
        return package.id == id;
    }
    package.name == name
}

/// Проверка, что версия пакета новее установленной.
fn is_newer(current: &str, candidate: &str) -> bool {
    let Ok(current) = semver::Version::parse(current.trim_start_matches('v')) else {
        return false;
    };
    let Ok(candidate) = semver::Version::parse(candidate.trim_start_matches('v')) else {
        return false;
    };
    candidate > current
}

/// Публикация события об изменении состава установленных плагинов.
fn emit_changed(host: &impl Host, plugin: &Installed) -> Result<(), String> {
    host.emit_event(EVENT_CHANGED, &json!({ "plugin": plugin }).to_string())
}

/// Поиск стора в реестре по идентификатору.
fn find_store(host: &impl Host, id: &str) -> Result<Store, String> {
    load_state(host)?
        .stores
        .into_iter()
        .find(|store| store.id == id)
        .ok_or_else(|| format!("стор {id} не найден"))
}

/// Загрузка индекса пакетов стора.
///
/// Пустой ответ означает, что индекса нет: ядро не обрывает вызов плагина из-за
/// отсутствующего файла, а сообщает об этом пустой строкой. Такой стор просто не
/// предлагает обновлений, а остальные сторы проверяются дальше.
fn load_index(host: &impl Host, store: &Store) -> Result<StoreIndex, String> {
    let text = host.store_read(&store.kind, &store.location, "store-index.json")?;
    if text.trim().is_empty() {
        return Err("в сторе нет индекса пакетов (store-index.json)".to_string());
    }
    serde_json::from_str(&text).map_err(|error| format!("некорректный индекс стора: {error}"))
}

/// Загрузка состояния из служебного хранилища.
///
/// Реестр проверяется на съехавший файловый путь: если у каталога нет своего
/// индекса, а в подкаталоге `updates` он есть, путь переводится туда. Так
/// исправляется стор, указанный на корень данных (`dev_data`) вместо каталога
/// обновлений внутри него, — иначе он числится подключённым, но ничего не
/// предлагает.
fn load_state(host: &impl Host) -> Result<StoreState, String> {
    let mut state = state::load::<StoreState>(host, STATE_KEY)?;
    if migrate_stores(host, &mut state) {
        save_state(host, &state)?;
    }
    Ok(state)
}

/// Перевод файловых сторов на каталог обновлений внутри каталога данных.
///
/// Возвращает признак изменения реестра: после него новое расположение
/// сохраняется, чтобы путь не пересчитывался при каждом обращении.
fn migrate_stores(host: &impl Host, state: &mut StoreState) -> bool {
    let mut changed = false;
    for store in &mut state.stores {
        // Сетевой стор адресуется напрямую: у него нет «вложенного каталога».
        if store.kind != "file" {
            continue;
        }
        let location = store.location.trim_end_matches(['/', '\\']);
        if location.is_empty() || has_index(host, store.kind.as_str(), location) {
            continue;
        }
        let nested = format!("{location}/{UPDATES_DIR_NAME}");
        if !has_index(host, store.kind.as_str(), &nested) {
            continue;
        }
        // Подпись, совпадающая с прежним последним сегментом, после переезда
        // начинает врать: её заменяет имя нового сегмента.
        if store.title.trim() == last_segment(location) {
            store.title = UPDATES_DIR_NAME.to_string();
        }
        store.location = nested;
        changed = true;
    }
    changed
}

/// Признак читаемого индекса пакетов по указанному расположению.
fn has_index(host: &impl Host, kind: &str, location: &str) -> bool {
    host.store_read(kind, location, INDEX_FILE)
        .map(|text| !text.trim().is_empty())
        .unwrap_or(false)
}

/// Последний сегмент пути или адреса.
fn last_segment(location: &str) -> &str {
    location.rsplit(['/', '\\']).next().unwrap_or(location)
}

/// Сохранение состояния в служебное хранилище.
fn save_state(host: &impl Host, state: &StoreState) -> Result<(), String> {
    state::save(host, STATE_KEY, state)
}

/// Извлечение обязательной строки из payload.
fn required_str(payload: &serde_json::Value, key: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(|value| value.as_str())
        .map(str::to_string)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("не указано поле {key}"))
}

#[cfg(test)]
#[path = "lib_tests.rs"]
mod tests;
