//! Файловый журнал диагностики.
//!
//! Технические события нужны не пользователю, а поддержке: когда что-то не
//! работает, по ним видно, что именно произошло в приложении. Поэтому события
//! пишутся **в файл** рядом с состоянием приложения, а не показываются в ленте
//! уведомлений: пользователю незачем читать «Плагин загружен», а без записи
//! на диск отчёт нечего было бы отдать.
//!
//! Журнал кольцевой: файл ограничен по размеру, старые записи вытесняются. Он
//! не является источником истины для интерфейса и не читается при обычной
//! работе — только когда пользователь просит отчёт.

use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use crate::plugin::Severity;

/// Имя файла журнала диагностики в каталоге состояния приложения.
pub const DIAGNOSTICS_FILE_NAME: &str = "diagnostics.log";

/// Предельный размер журнала: после него старые записи вытесняются.
///
/// Размер небольшой: журнал живёт ради одного отчёта, а не истории. Мегабайта
/// хватает на сотни событий с подробностями, при этом отчёт остаётся удобным
/// для пересылки.
const MAX_BYTES: u64 = 1_024 * 1_024;

/// Доля файла, сохраняемая при вытеснении старых записей.
const KEEP_RATIO: f64 = 0.5;

/// Общий журнал диагностики: путь к файлу и замок записи.
struct Diagnostics {
    /// Путь к файлу журнала.
    path: PathBuf,
    /// Замок, чтобы записи из разных потоков не перемешивались.
    lock: Mutex<()>,
}

/// Единственный журнал процесса.
///
/// Замок вокруг значения позволяет тестам перенаправлять журнал в свой каталог:
/// файл один на процесс, но проверки должны видеть только свои записи.
static DIAGNOSTICS: OnceLock<Mutex<Option<Diagnostics>>> = OnceLock::new();

/// Ячейка журнала процесса.
fn slot() -> &'static Mutex<Option<Diagnostics>> {
    DIAGNOSTICS.get_or_init(|| Mutex::new(None))
}

/// Настройка файла журнала диагностики.
///
/// Вызывается один раз при старте: до этого технические события не пишутся.
/// Повторный вызов безвреден и оставляет первый путь.
pub fn init(state_root: &Path) {
    let path = state_root.join(DIAGNOSTICS_FILE_NAME);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if let Ok(mut current) = slot().lock() {
        *current = Some(Diagnostics {
            path,
            lock: Mutex::new(()),
        });
    }
}

/// Путь к файлу журнала диагностики, если он настроен.
pub fn path() -> Option<PathBuf> {
    slot()
        .lock()
        .ok()
        .and_then(|current| current.as_ref().map(|item| item.path.clone()))
}

/// Признак настроенного журнала диагностики.
pub fn is_ready() -> bool {
    slot()
        .lock()
        .map(|current| current.is_some())
        .unwrap_or(false)
}

/// Чтение журнала диагностики целиком.
///
/// Возвращает `None`, если журнал не настроен или файла ещё нет: отчёт
/// поддержки в этом случае честно пишет, что журнал пуст.
pub fn read() -> Option<String> {
    let path = path()?;
    std::fs::read_to_string(path).ok()
}

/// Дата отчёта в читаемом виде.
pub fn timestamp_for_report() -> String {
    utc_timestamp()
}

/// Метка времени для имени файла: `ГГГГММДД-ччммсс`.
///
/// Двоеточия и дефисы из полного времени в имени файла недопустимы на части
/// систем, поэтому метка собирается отдельно.
pub fn file_stamp() -> String {
    let stamp = utc_timestamp();
    let compact: String = stamp
        .chars()
        .filter(|symbol| symbol.is_ascii_digit())
        .collect();
    format!("{}-{}", &compact[0..8], &compact[8..14])
}

/// Запись технического события в файл.
///
/// Формат — одна строка на событие: время, важность, источник, текст и
/// подробности. Такой журнал читается глазами и не требует разбора.
/// Ошибка записи не влияет на работу приложения: диагностика не должна ломать
/// то, что она описывает.
pub fn record(severity: Severity, message: &str, source: &str, details: &serde_json::Value) {
    let Ok(current) = slot().lock() else {
        return;
    };
    let Some(diagnostics) = current.as_ref() else {
        return;
    };
    let Ok(_guard) = diagnostics.lock.lock() else {
        return;
    };
    let line = format_line(severity, message, source, details);
    if append(&diagnostics.path, &line).is_err() {
        // Сбой записи диагностики не должен всплывать наружу.
    }
}

/// Формирование одной строки журнала.
///
/// Время — в UTC с миллисекундами, без внешних библиотек: формат разбирается
/// поддержкой, а не интерфейсом. Подробности пишутся компактным JSON.
fn format_line(
    severity: Severity,
    message: &str,
    source: &str,
    details: &serde_json::Value,
) -> String {
    let details = if details
        .as_object()
        .map(|object| object.is_empty())
        .unwrap_or(true)
    {
        String::new()
    } else {
        format!(" {}", details)
    };
    format!(
        "{} {:<5} [{}] {}{}\n",
        utc_timestamp(),
        severity_name(severity),
        source,
        message,
        details
    )
}

/// Имя степени серьёзности для журнала.
fn severity_name(severity: Severity) -> &'static str {
    match severity {
        Severity::Error => "ERROR",
        Severity::Warn => "WARN",
        Severity::Info => "INFO",
        Severity::Debug => "DEBUG",
        Severity::Trace => "TRACE",
    }
}

/// Текущее время в виде `ГГГГ-ММ-ДДTчч:мм:сс.мссZ`.
fn utc_timestamp() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    let total_seconds = now.as_secs();
    let millis = now.subsec_millis();
    let (year, month, day) = civil_from_days((total_seconds / 86_400) as i64);
    let seconds_of_day = total_seconds % 86_400;
    format!(
        "{year:04}-{month:02}-{day:02}T{:02}:{:02}:{:02}.{millis:03}Z",
        seconds_of_day / 3600,
        (seconds_of_day % 3600) / 60,
        seconds_of_day % 60
    )
}

/// Преобразование числа дней от эпохи в календарную дату.
///
/// Алгоритм Говарда Хиннанта: без зависимостей и часовых поясов.
fn civil_from_days(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let day_of_era = (z - era * 146_097) as u64;
    let year_of_era =
        (day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
    let year = year_of_era as i64 + era * 400;
    let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
    let mp = (5 * day_of_year + 2) / 153;
    let day = (day_of_year - (153 * mp + 2) / 5 + 1) as u32;
    let month = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if month <= 2 { year + 1 } else { year }, month, day)
}

/// Дописывание строки в файл с вытеснением старых записей.
fn append(path: &Path, line: &str) -> std::io::Result<()> {
    let size = std::fs::metadata(path).map(|meta| meta.len()).unwrap_or(0);
    if size + line.len() as u64 > MAX_BYTES {
        rotate(path)?;
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)?;
    file.write_all(line.as_bytes())
}

/// Вытеснение старых записей: в файле остаётся последняя половина.
fn rotate(path: &Path) -> std::io::Result<()> {
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let mut keep_from = (content.len() as f64 * (1.0 - KEEP_RATIO)) as usize;
    // Смещение половины файла редко приходится на границу символа — а журнал
    // пишется по-русски, и срез по такому байту паникует. Паника в вытеснении
    // не даёт записать ни одного следующего события: журнал молча перестаёт
    // пополняться. Граница выравнивается до начала символа.
    while keep_from > 0 && !content.is_char_boundary(keep_from) {
        keep_from -= 1;
    }
    // Границу сдвигаем к началу следующей строки: обрезанная запись хуже её
    // отсутствия. Начало файла тоже не рвём.
    if keep_from > 0 {
        keep_from = content[keep_from..]
            .find('\n')
            .map(|offset| keep_from + offset + 1)
            .unwrap_or(content.len());
    }
    let mut file = std::fs::File::create(path)?;
    file.write_all(&content.as_bytes()[keep_from..])
}

#[cfg(test)]
#[path = "diagnostics_tests.rs"]
mod tests;
