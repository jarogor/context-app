//! Host-runtime для плагинов.
//!
//! Сканирует директории плагинов, загружает их в Extism runtime без WASI и без
//! доступа к сети и предоставляет host-функции, объявленные общим контрактом
//! плагинов. Загрузка плагинов вынесена в [`load`], трассировка вызовов — в
//! [`trace`], host-функции — в [`host`], общие корни — в [`host_state`].

mod host;
mod host_state;
mod load;
mod trace;

use std::path::{Path, PathBuf};

use crate::plugin::{LoadedPlugin, PluginError, PluginKind};

use host_state::{RuntimeRoots, SandboxRoot};

/// Плагинная подсистема приложения.
pub struct PluginRuntime {
    /// Загруженные плагины в порядке обнаружения.
    plugins: Vec<LoadedPlugin>,
    /// Общие корни и переключатели, разделяемые с host-функциями.
    roots: RuntimeRoots,
}

impl PluginRuntime {
    /// Создание пустого runtime без песочницы.
    pub fn empty() -> Self {
        Self {
            plugins: Vec::new(),
            roots: RuntimeRoots::new(PathBuf::from("."), Vec::new()),
        }
    }

    /// Установка source-корня для host-функций файловой системы.
    pub fn set_sandbox_root(&mut self, root: PathBuf) {
        let mut current = self
            .roots
            .sandbox_root
            .lock()
            .expect("не удалось захватить песочный корень runtime");
        *current = SandboxRoot::new(root);
    }

    /// Установка отдельного корня служебного хранилища source-плагинов.
    pub fn set_storage_root(&mut self, root: PathBuf) {
        let mut current = self
            .roots
            .storage_root
            .lock()
            .expect("не удалось захватить корень storage runtime");
        *current = Some(root);
    }

    /// Установка корня пользовательского каталога плагинов для стора.
    pub fn set_plugin_store_root(&mut self, root: PathBuf) {
        let mut current = self
            .roots
            .plugin_store_root
            .lock()
            .expect("не удалось захватить корень стора плагинов");
        *current = Some(root);
    }

    /// Установка корня реестра активности плагинов.
    pub fn set_activation_root(&mut self, root: PathBuf) {
        let mut current = self
            .roots
            .activation_root
            .lock()
            .expect("не удалось захватить корень реестра активности");
        *current = Some(root);
    }

    /// Установка директорий для перечня плагинов стора.
    pub fn set_catalog_dirs(&mut self, directories: Vec<PathBuf>) {
        let mut current = self
            .roots
            .catalog_dirs
            .lock()
            .expect("не удалось захватить директории перечня плагинов");
        *current = directories;
    }

    /// Разрешение записи в активный plugin-корень.
    pub fn set_sandbox_writable(&mut self, writable: bool) {
        let mut state = self
            .roots
            .sandbox_writable
            .lock()
            .expect("не удалось захватить режим записи sandbox");
        *state = writable;
    }

    /// Человекочитаемые имена загруженных плагинов.
    pub fn plugin_names(&self) -> Vec<String> {
        self.plugins.iter().map(|p| p.name.clone()).collect()
    }

    /// Человекочитаемое имя плагина по идентификатору.
    pub fn plugin_name(&self, id: &str) -> Option<String> {
        self.plugins
            .iter()
            .find(|plugin| plugin.id == id)
            .map(|plugin| plugin.name.clone())
    }

    /// Идентификаторы загруженных source-плагинов.
    pub fn source_plugin_ids(&self) -> Vec<String> {
        self.plugins
            .iter()
            .filter(|plugin| plugin.kind == PluginKind::Source)
            .map(|plugin| plugin.id.clone())
            .collect()
    }

    /// Идентификаторы загруженных плагинов рабочего места.
    pub fn workplace_plugin_ids(&self) -> Vec<String> {
        self.plugins
            .iter()
            .filter(|plugin| plugin.kind == PluginKind::Workplace)
            .map(|plugin| plugin.id.clone())
            .collect()
    }

    /// Форматы книг, поддерживаемые загруженными плагинами рабочего места.
    ///
    /// Значения нормализуются к нижнему регистру и дедуплицируются; порядок
    /// сохраняется по первому появлению.
    pub fn workplace_formats(&self) -> Vec<String> {
        let mut formats: Vec<String> = Vec::new();
        for plugin in self
            .plugins
            .iter()
            .filter(|plugin| plugin.kind == PluginKind::Workplace)
        {
            for format in &plugin.formats {
                let normalized = format.trim().to_ascii_lowercase();
                if normalized.is_empty() || formats.contains(&normalized) {
                    continue;
                }
                formats.push(normalized);
            }
        }
        formats
    }

    /// Идентификатор плагина рабочего места, обслуживающего формат.
    pub fn workplace_plugin_for_format(&self, format: &str) -> Option<String> {
        self.plugins
            .iter()
            .find(|plugin| plugin.kind == PluginKind::Workplace && plugin.supports_format(format))
            .map(|plugin| plugin.id.clone())
    }

    /// Абсолютный путь к модулю рисования плагина рабочего места.
    pub fn viewer_path(&self, id: &str) -> Option<PathBuf> {
        let plugin = self
            .plugins
            .iter()
            .find(|plugin| plugin.id == id && plugin.kind == PluginKind::Workplace)?;
        let viewer = plugin.viewer.as_deref()?;
        Some(plugin.dir.join(viewer))
    }

    /// Каталог модуля рисования плагина рабочего места.
    ///
    /// Каталог определяется по объявленному пути модуля: файлы перечисляются и
    /// читаются относительно него. Возвращается `None`, если плагин не найден,
    /// не является плагином рабочего места или не объявил модуль рисования.
    pub fn viewer_dir(&self, id: &str) -> Option<PathBuf> {
        let path = self.viewer_path(id)?;
        path.parent().map(Path::to_path_buf)
    }

    /// Опрос source-плагина: приоритет поддержки корня или `None`.
    pub(crate) fn probe_priority(&mut self, id: &str) -> Result<Option<i32>, PluginError> {
        let output = self.invoke_operation(id, "probe", serde_json::json!({}))?;
        let value: serde_json::Value = serde_json::from_str(&output)
            .map_err(|error| PluginError::call(id, error.to_string()))?;
        let supported = value
            .get("supported")
            .and_then(|value| value.as_bool())
            .unwrap_or(false);
        if !supported {
            return Ok(None);
        }
        let priority = value
            .get("priority")
            .and_then(|value| value.as_i64())
            .unwrap_or(0) as i32;
        Ok(Some(priority))
    }

    /// Вызов экспортируемой функции загруженного плагина по идентификатору.
    pub fn invoke(&mut self, id: &str, input: &str) -> Result<String, PluginError> {
        let started = std::time::Instant::now();
        let name = self.plugin_name(id).unwrap_or_else(|| id.to_string());
        let result = self.invoke_raw(id, input);
        trace::trace_call(&name, "invoke", input, &result, started.elapsed());
        result
    }

    /// Непосредственный вызов плагина без трассировки.
    fn invoke_raw(&mut self, id: &str, input: &str) -> Result<String, PluginError> {
        self.plugins
            .iter_mut()
            .find(|p| p.id == id)
            .ok_or_else(|| PluginError::UnknownPlugin(id.to_string()))?
            .invoke(input)
    }

    /// Выполнение произвольной операции source-плагина без интерпретации payload ядром.
    pub(crate) fn invoke_operation(
        &mut self,
        id: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let mut request = serde_json::Map::new();
        request.insert(
            "action".to_string(),
            serde_json::Value::String(operation.to_string()),
        );
        request.insert("payload".to_string(), payload);
        let input = serde_json::Value::Object(request).to_string();
        let started = std::time::Instant::now();
        let name = self.plugin_name(id).unwrap_or_else(|| id.to_string());
        let result = self.invoke_raw(id, &input);
        trace::trace_call(&name, operation, &input, &result, started.elapsed());
        result
    }

    /// Декларации настроек загруженных плагинов.
    ///
    /// Для каждого плагина с непустой декларацией возвращается источник
    /// `{ owner, kind, schema }`, пригодный для opaque-передачи базовому
    /// плагину настроек. Владельцем выступает идентификатор плагина.
    /// Содержимое схемы ядро не интерпретирует.
    pub(crate) fn settings_sources(&self) -> Vec<serde_json::Value> {
        self.plugins
            .iter()
            .filter_map(|plugin| {
                let schema = plugin.settings.as_ref()?;
                if schema.is_null() {
                    return None;
                }
                Some(serde_json::json!({
                    "owner": plugin.id,
                    "kind": plugin.kind,
                    "schema": schema,
                }))
            })
            .collect()
    }

    /// Идентификатор плагина, предоставляющего указанную capability.
    pub fn plugin_providing(&self, capability: &str) -> Option<String> {
        self.plugins
            .iter()
            .find(|plugin| plugin.provides.iter().any(|value| value == capability))
            .map(|plugin| plugin.id.clone())
    }

    /// Выполнение операции плагина, предоставляющего capability.
    ///
    /// Ядро маршрутизирует opaque-запрос провайдеру, не интерпретируя payload.
    pub(crate) fn invoke_capability(
        &mut self,
        capability: &str,
        operation: &str,
        payload: serde_json::Value,
    ) -> Result<String, PluginError> {
        let name = self
            .plugin_providing(capability)
            .ok_or_else(|| PluginError::MissingCapability(capability.to_string()))?;
        self.invoke_operation(&name, operation, payload)
    }
}

#[cfg(test)]
#[path = "runtime_tests.rs"]
mod tests;
