//! Загрузка плагинов в runtime.
//!
//! Обнаружение директорий плагинов, загрузка модулей в Extism, регистрация
//! host-функций через [`super::host::registration`] и топологическая сортировка
//! зависимостей по capability.

use std::fs;
use std::path::{Path, PathBuf};

use extism::{Manifest, PluginBuilder, Wasm};

use crate::plugin::contract::{EXPORT_FUNCTION, MANIFEST_FILE_NAME};
use crate::plugin::{
    get_bus, LoadedPlugin, PluginError, PluginKind, PluginManifest, PluginScope, Severity,
};

use super::host;
use super::host_state::RuntimeRoots;
use super::PluginRuntime;

impl PluginRuntime {
    /// Загрузка всех плагинов из указанных директорий.
    ///
    /// Некорректные плагины отбраковываются с ошибкой: каждый плагин
    /// загружается независимо, поэтому сбой одного не влияет на остальные.
    /// Отсутствующие директории пропускаются, чтобы внешняя библиотека без
    /// собственной папки `plugins/` могла использовать поставляемые плагины.
    ///
    /// `sandbox_root` — корень, за пределы которого source-плагинам запрещено
    /// читать файловую систему.
    #[cfg(test)]
    pub fn load(
        directories: &[PathBuf],
        sandbox_root: impl Into<PathBuf>,
    ) -> Result<Self, PluginError> {
        Self::load_filtered(directories, sandbox_root, None, &[], None)
    }

    /// Загрузка плагинов выбранных областей из указанных директорий.
    ///
    /// `scopes` ограничивает набор загружаемых областей; `None` загружает все.
    /// `cache_config` — путь к конфигурации постоянного кэша компиляции; `None`
    /// использует системный кэш wasmtime по умолчанию. Остальное поведение
    /// совпадает с [`PluginRuntime::load`].
    pub fn load_scopes(
        directories: &[PathBuf],
        sandbox_root: impl Into<PathBuf>,
        scopes: Option<&[PluginScope]>,
        cache_config: Option<&Path>,
    ) -> Result<Self, PluginError> {
        Self::load_filtered(directories, sandbox_root, scopes, &[], cache_config)
    }

    /// Загрузка плагинов с учётом отключённых.
    ///
    /// Отключённые плагины (кроме каркасных) не загружаются.
    pub(crate) fn load_filtered(
        directories: &[PathBuf],
        sandbox_root: impl Into<PathBuf>,
        scopes: Option<&[PluginScope]>,
        disabled: &[String],
        cache_config: Option<&Path>,
    ) -> Result<Self, PluginError> {
        let roots = RuntimeRoots::new(sandbox_root.into(), directories.to_vec());
        let mut plugins = Vec::new();
        let mut seen = std::collections::HashSet::new();
        for directory in directories {
            let Ok(entries) = fs::read_dir(directory) else {
                continue;
            };
            for entry in entries {
                let entry = entry?;
                if !entry.file_type()?.is_dir() {
                    continue;
                }
                let dir = entry.path();
                match Self::load_plugin_dir(&dir, &roots, cache_config) {
                    Ok(plugin) => {
                        if !plugin.level.is_framework()
                            && disabled.iter().any(|id| id == &plugin.id)
                        {
                            continue;
                        }
                        if let Some(scopes) = scopes {
                            if !scopes.contains(&plugin.scope) {
                                continue;
                            }
                        }
                        // При загрузке из двух мест (plugins/ и ресурсы) один и тот
                        // же плагин не должен загружаться повторно.
                        if seen.insert(plugin.id.clone()) {
                            get_bus().publish(
                                Severity::Info,
                                format!("Плагин загружен: {}", plugin.name),
                                "core",
                                serde_json::json!({
                                    "id": plugin.id,
                                    "name": plugin.name,
                                    "level": plugin.level,
                                    "kind": plugin.kind,
                                }),
                            );
                            plugins.push(plugin);
                        }
                    }
                    Err(err) => {
                        get_bus().publish(
                            Severity::Warn,
                            format!("Плагин пропущен: {err}"),
                            "core",
                            serde_json::json!({ "dir": dir.display().to_string() }),
                        );
                    }
                }
            }
        }
        Self::resolve_dependencies(&mut plugins)?;
        Ok(Self { plugins, roots })
    }

    /// Загрузка одного плагина из его директории.
    fn load_plugin_dir(
        dir: &Path,
        roots: &RuntimeRoots,
        cache_config: Option<&Path>,
    ) -> Result<LoadedPlugin, PluginError> {
        let manifest = PluginManifest::load(&dir.join(MANIFEST_FILE_NAME)).map_err(|e| {
            PluginError::InvalidManifest {
                dir: dir.to_path_buf(),
                reason: match e {
                    PluginError::InvalidManifest { reason, .. } => reason,
                    other => other.to_string(),
                },
            }
        })?;
        manifest.validate(dir)?;

        let plugin = if manifest.module.trim().is_empty() {
            None
        } else {
            if manifest.export != EXPORT_FUNCTION {
                return Err(PluginError::MissingExport {
                    dir: dir.to_path_buf(),
                    function: EXPORT_FUNCTION.to_string(),
                });
            }

            let wasm_path = dir.join(&manifest.module);
            if !wasm_path.exists() {
                return Err(PluginError::ModuleNotFound {
                    dir: dir.to_path_buf(),
                    module: manifest.module.clone(),
                });
            }

            let extism_manifest = Manifest::new([Wasm::file(&wasm_path)]).disallow_all_hosts();

            let mut builder = PluginBuilder::new(extism_manifest).with_wasi(false);
            if let Some(cache_config) = cache_config {
                builder = builder.with_cache_config(cache_config);
            }
            builder = host::registration::register(builder, roots, &manifest);

            let plugin = builder.build().map_err(|e| PluginError::Build {
                dir: dir.to_path_buf(),
                message: e.to_string(),
            })?;

            if !plugin.function_exists(&manifest.export) {
                return Err(PluginError::MissingExport {
                    dir: dir.to_path_buf(),
                    function: manifest.export.clone(),
                });
            }

            Some(plugin)
        };

        if manifest.kind == PluginKind::Format {
            if let Some(viewer) = manifest.viewer.as_deref() {
                if !dir.join(viewer).is_file() {
                    return Err(PluginError::InvalidManifest {
                        dir: dir.to_path_buf(),
                        reason: format!("модуль рисования {viewer} отсутствует в плагине"),
                    });
                }
            }
        }

        let scope = manifest.scope();
        Ok(LoadedPlugin {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version.clone(),
            description: manifest.description.clone(),
            level: manifest.level,
            kind: manifest.kind,
            scope,
            provides: manifest.provides,
            requires: manifest.requires,
            settings: manifest.settings,
            function: manifest.export,
            formats: manifest.formats,
            viewer: manifest.viewer,
            flowing: manifest.flowing,
            dir: dir.to_path_buf(),
            plugin,
        })
    }

    /// Проверка и топологическая сортировка зависимостей плагинов.
    fn resolve_dependencies(plugins: &mut Vec<LoadedPlugin>) -> Result<(), PluginError> {
        let mut provided_by = std::collections::HashMap::new();
        for plugin in plugins.iter() {
            for capability in &plugin.provides {
                if let Some(previous) = provided_by.insert(capability.clone(), plugin.id.clone()) {
                    return Err(PluginError::call(
                        plugin.id.clone(),
                        format!("capability {capability} уже предоставляется {previous}"),
                    ));
                }
            }
        }
        for plugin in plugins.iter() {
            for capability in &plugin.requires {
                if !provided_by.contains_key(capability) {
                    return Err(PluginError::Dependency {
                        plugin: plugin.id.clone(),
                        capability: capability.clone(),
                    });
                }
            }
        }
        let mut ordered = Vec::with_capacity(plugins.len());
        let mut remaining = std::mem::take(plugins);
        while !remaining.is_empty() {
            let mut progressed = false;
            let mut index = 0;
            while index < remaining.len() {
                let ready = remaining[index].requires.iter().all(|required| {
                    let Some(provider) = provided_by.get(required) else {
                        return false;
                    };
                    ordered
                        .iter()
                        .any(|plugin: &LoadedPlugin| &plugin.id == provider)
                });
                if ready {
                    ordered.push(remaining.remove(index));
                    progressed = true;
                } else {
                    index += 1;
                }
            }
            if !progressed {
                return Err(PluginError::DependencyCycle(remaining[0].id.clone()));
            }
        }
        *plugins = ordered;
        Ok(())
    }
}
