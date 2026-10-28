//! Подготовка и применение обновления ядра приложения.
//!
//! Артефакт скачивается в служебный каталог, проверяется по SHA-256 и
//! распаковывается. Замена файлов выполняется отдельным процессом-помощником:
//! он ждёт завершения приложения, накладывает новый выпуск на каталог установки
//! и запускает его заново. Так обновляется всё ядро целиком — приложение и
//! каркасные плагины, живущие рядом с ним.

use std::fs::{self, File};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

use sha2::{Digest, Sha256};
use zip::ZipArchive;

use super::models::{ApplyOutcome, CoreRelease, ReleaseArtifact, ReleaseMode, UpdateConfig};
use super::{source, version, MAX_ARTIFACT_BYTES};

/// Максимальное число записей в пакете обновления.
const MAX_ENTRIES: usize = 8192;

/// Максимальный суммарный размер распакованного пакета.
const MAX_EXTRACTED_BYTES: u64 = 2 * 1024 * 1024 * 1024;

/// Имя каталога подготовленных обновлений в состоянии приложения.
const UPDATES_DIR_NAME: &str = "updates";

/// Имя журнала применения обновления.
const APPLY_LOG_NAME: &str = "apply.log";

/// Подготовка обновления ядра и запуск процесса применения.
///
/// Возвращает результат сразу после запуска помощника: он ждёт завершения
/// приложения, поэтому перезапуск выполняет именно он.
pub fn apply_core(
    state_root: &Path,
    config: &UpdateConfig,
    current_version: &str,
) -> Result<ApplyOutcome, String> {
    let source = config
        .source
        .as_ref()
        .ok_or_else(|| "источник обновлений не настроен".to_string())?;
    source.validate()?;
    let index = source::read_index(source)?;
    let core = index
        .core
        .ok_or_else(|| "в источнике нет выпуска ядра".to_string())?;
    if !version::is_newer(current_version, &core.version)? {
        return Err(format!("версия {} не новее текущей", core.version));
    }
    let platform = version::platform_key();
    let artifact = core
        .platforms
        .get(&platform)
        .ok_or_else(|| format!("в выпуске нет артефакта для платформы {platform}"))?;
    apply_release(state_root, source, &core, artifact)
}

/// Подготовка конкретного выпуска ядра.
pub(super) fn apply_release(
    state_root: &Path,
    source: &super::models::UpdateSource,
    core: &CoreRelease,
    artifact: &ReleaseArtifact,
) -> Result<ApplyOutcome, String> {
    let staging = staging_dir(state_root, &core.version, artifact.mode);
    if staging.exists() {
        fs::remove_dir_all(&staging)
            .map_err(|error| format!("не удалось очистить прошлую загрузку: {error}"))?;
    }
    fs::create_dir_all(&staging)
        .map_err(|error| format!("каталог обновления не создан: {error}"))?;

    let (payload, should_extract) = match artifact.mode {
        ReleaseMode::Portable => {
            let archive = staging.join("package.zip");
            download_artifact(source, artifact, &archive)?;
            (staging.join("payload"), true)
        }
        ReleaseMode::Appimage | ReleaseMode::Installer => {
            let file = staging.join("artifact");
            download_artifact(source, artifact, &file)?;
            (file, false)
        }
    };
    if should_extract {
        extract_package(&staging.join("package.zip"), &payload)?;
    }

    let executable =
        std::env::current_exe().map_err(|error| format!("путь приложения недоступен: {error}"))?;
    let appimage = appimage_path();
    let target = match artifact.mode {
        ReleaseMode::Appimage => appimage
            .clone()
            .ok_or_else(|| "приложение запущено не из AppImage".to_string())?,
        _ => install_target(&executable),
    };
    let log_path = staging.join(APPLY_LOG_NAME);
    spawn_helper(
        &staging,
        artifact.mode,
        &payload,
        &target,
        &executable,
        &log_path,
        appimage.as_deref(),
    )?;
    Ok(ApplyOutcome {
        version: core.version.clone(),
        restart_required: true,
        log_path: log_path.to_string_lossy().into_owned(),
    })
}

/// Загрузка артефакта и проверка контрольной суммы.
fn download_artifact(
    source: &super::models::UpdateSource,
    artifact: &ReleaseArtifact,
    destination: &Path,
) -> Result<(), String> {
    source::download(source, &artifact.location, destination, MAX_ARTIFACT_BYTES)?;
    verify_sha256(
        destination,
        artifact.sha256.as_deref(),
        source.kind == "network",
    )
}

/// Проверка SHA-256 файла.
///
/// `required` делает отсутствие ожидаемой суммы ошибкой; для файлового
/// источника сумма необязательна, но если указана — проверяется.
pub fn verify_sha256(path: &Path, expected: Option<&str>, required: bool) -> Result<(), String> {
    let Some(expected) = expected.map(str::trim).filter(|value| !value.is_empty()) else {
        return if required {
            Err("для сетевого обновления не указана контрольная сумма".to_string())
        } else {
            Ok(())
        };
    };
    let actual = sha256_of(path)?;
    if !actual.eq_ignore_ascii_case(expected) {
        return Err(format!(
            "контрольная сумма не совпадает: ожидалась {expected}, получена {actual}"
        ));
    }
    Ok(())
}

/// Вычисление SHA-256 файла в hex.
pub fn sha256_of(path: &Path) -> Result<String, String> {
    let mut file =
        File::open(path).map_err(|error| format!("файл не открыт для проверки: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("файл не прочитан для проверки: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

/// Безопасная распаковка zip-пакета обновления.
pub fn extract_package(archive: &Path, destination: &Path) -> Result<(), String> {
    let file = File::open(archive).map_err(|error| format!("пакет не открыт: {error}"))?;
    let mut zip =
        ZipArchive::new(file).map_err(|error| format!("некорректный zip-пакет: {error}"))?;
    if zip.len() > MAX_ENTRIES {
        return Err(format!("в пакете слишком много файлов: {}", zip.len()));
    }
    fs::create_dir_all(destination)
        .map_err(|error| format!("каталог распаковки не создан: {error}"))?;
    let mut total: u64 = 0;
    let mut files = 0usize;
    for index in 0..zip.len() {
        let mut entry = zip
            .by_index(index)
            .map_err(|error| format!("запись пакета не прочитана: {error}"))?;
        if let Some(mode) = entry.unix_mode() {
            if mode & 0o170000 == 0o120000 {
                return Err("пакет содержит символическую ссылку".to_string());
            }
        }
        let Some(relative) = entry.enclosed_name() else {
            return Err(format!("некорректный путь в пакете: {}", entry.name()));
        };
        total = total.saturating_add(entry.size());
        if total > MAX_EXTRACTED_BYTES {
            return Err("распакованный пакет превышает допустимый размер".to_string());
        }
        let target = destination.join(&relative);
        if entry.is_dir() {
            fs::create_dir_all(&target)
                .map_err(|error| format!("каталог пакета не создан: {error}"))?;
            continue;
        }
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("каталог пакета не создан: {error}"))?;
        }
        let mut output =
            File::create(&target).map_err(|error| format!("файл пакета не создан: {error}"))?;
        io::copy(&mut entry, &mut output)
            .map_err(|error| format!("файл пакета не записан: {error}"))?;
        apply_unix_mode(&target, entry.unix_mode());
        files += 1;
    }
    if files == 0 {
        return Err("пакет обновления пуст".to_string());
    }
    Ok(())
}

/// Перенос прав исполнения из zip-записи на распакованный файл.
fn apply_unix_mode(path: &Path, mode: Option<u32>) {
    #[cfg(unix)]
    if let Some(mode) = mode {
        use std::os::unix::fs::PermissionsExt;
        let permissions = fs::Permissions::from_mode(mode & 0o777);
        let _ = fs::set_permissions(path, permissions);
    }
    #[cfg(not(unix))]
    let _ = (path, mode);
}

/// Каталог подготовленного обновления.
fn staging_dir(state_root: &Path, version: &str, mode: ReleaseMode) -> PathBuf {
    let safe_version: String = version
        .chars()
        .map(|value| {
            if value.is_ascii_alphanumeric() || matches!(value, '.' | '-' | '+') {
                value
            } else {
                '_'
            }
        })
        .collect();
    state_root
        .join(UPDATES_DIR_NAME)
        .join(format!("{safe_version}-{}", mode_name(mode)))
}

/// Имя способа установки для пути подготовки.
fn mode_name(mode: ReleaseMode) -> &'static str {
    match mode {
        ReleaseMode::Portable => "portable",
        ReleaseMode::Appimage => "appimage",
        ReleaseMode::Installer => "installer",
    }
}

/// Каталог установки приложения: рядом с исполняемым файлом или корень `.app`.
pub fn install_target(executable: &Path) -> PathBuf {
    #[cfg(target_os = "macos")]
    {
        for ancestor in executable.ancestors() {
            if ancestor.file_name().and_then(|name| name.to_str()) == Some("Contents") {
                if let Some(bundle) = ancestor.parent() {
                    return bundle.to_path_buf();
                }
            }
        }
    }
    executable
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

/// Путь текущего AppImage, если приложение запущено из него.
pub fn appimage_path() -> Option<PathBuf> {
    std::env::var_os("APPIMAGE").map(PathBuf::from)
}

/// Запуск процесса-помощника, который применит обновление после выхода.
fn spawn_helper(
    staging: &Path,
    mode: ReleaseMode,
    payload: &Path,
    target: &Path,
    executable: &Path,
    log_path: &Path,
    appimage: Option<&Path>,
) -> Result<(), String> {
    let pid = std::process::id().to_string();
    let mode = mode_name(mode);
    let payload = payload.to_string_lossy().into_owned();
    let target = target.to_string_lossy().into_owned();
    let executable = executable.to_string_lossy().into_owned();
    let log = log_path.to_string_lossy().into_owned();
    let appimage = appimage
        .map(|path| path.to_string_lossy().into_owned())
        .unwrap_or_default();
    let mut command = helper_command(
        staging,
        &[&pid, mode, &payload, &target, &executable, &log, &appimage],
    )?;
    command
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| format!("процесс обновления не запущен: {error}"))?;
    Ok(())
}

/// Команда запуска помощника для текущей платформы.
fn helper_command(staging: &Path, args: &[&str]) -> Result<Command, String> {
    #[cfg(windows)]
    {
        let script = staging.join("apply.ps1");
        write_helper_script(&script, POWERSHELL_HELPER)?;
        let mut command = Command::new("powershell");
        command
            .arg("-NoProfile")
            .arg("-ExecutionPolicy")
            .arg("Bypass")
            .arg("-File")
            .arg(script)
            .args(args);
        Ok(command)
    }
    #[cfg(not(windows))]
    {
        let script = staging.join("apply.sh");
        write_helper_script(&script, UNIX_HELPER)?;
        let mut command = Command::new("sh");
        command.arg(script).args(args);
        Ok(command)
    }
}

/// Запись скрипта помощника.
fn write_helper_script(path: &Path, content: &str) -> Result<(), String> {
    let mut file =
        File::create(path).map_err(|error| format!("скрипт обновления не создан: {error}"))?;
    file.write_all(content.as_bytes())
        .map_err(|error| format!("скрипт обновления не записан: {error}"))
}

/// Скрипт применения обновления на Unix.
#[cfg(not(windows))]
const UNIX_HELPER: &str = r#"#!/bin/sh
pid="$1"
mode="$2"
payload="$3"
target="$4"
exe="$5"
log="$6"
appimage="$7"

echo "ожидание завершения приложения $pid" >> "$log"
while kill -0 "$pid" 2>/dev/null; do
  sleep 0.2
done

case "$mode" in
  portable)
    echo "наложение пакета на $target" >> "$log"
    rm -rf "$target" >> "$log" 2>&1
    mkdir -p "$target" >> "$log" 2>&1
    cp -R "$payload"/. "$target"/ >> "$log" 2>&1
    chmod +x "$exe" 2>/dev/null
    ( "$exe" >> "$log" 2>&1 & )
    ;;
  appimage)
    echo "замена AppImage $appimage" >> "$log"
    cp "$payload" "$appimage" >> "$log" 2>&1
    chmod +x "$appimage" 2>/dev/null
    ( "$appimage" >> "$log" 2>&1 & )
    ;;
  installer)
    echo "запуск установщика $payload" >> "$log"
    ( "$payload" >> "$log" 2>&1 & )
    ;;
  *)
    echo "неизвестный способ установки: $mode" >> "$log"
    ;;
esac
"#;

/// Скрипт применения обновления на Windows.
#[cfg(windows)]
const POWERSHELL_HELPER: &str = r#"param(
  [int]$TargetPid,
  [string]$Mode,
  [string]$Payload,
  [string]$Target,
  [string]$Exe,
  [string]$Log,
  [string]$AppImage
)

Add-Content -Path $Log -Value "ожидание завершения приложения $TargetPid"
while (Get-Process -Id $TargetPid -ErrorAction SilentlyContinue) {
  Start-Sleep -Milliseconds 200
}

switch ($Mode) {
  "portable" {
    Add-Content -Path $Log -Value "наложение пакета на $Target"
    Remove-Item -Path (Join-Path $Target "*") -Recurse -Force -ErrorAction SilentlyContinue
    Copy-Item -Path (Join-Path $Payload "*") -Destination $Target -Recurse -Force -ErrorAction SilentlyContinue
    Start-Process -FilePath $Exe
  }
  "installer" {
    Add-Content -Path $Log -Value "запуск установщика $Payload"
    Start-Process -FilePath $Payload
  }
  default {
    Add-Content -Path $Log -Value "неизвестный способ установки: $Mode"
  }
}
"#;

#[cfg(test)]
#[path = "package_tests.rs"]
mod tests;
