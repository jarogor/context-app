//! Демонстрационный плагин Jarogor BookLib.
//!
//! Экспортирует функцию `invoke` по контракту приложения и
//! использует host-функцию `log` для передачи сообщения приложению.

use extism_pdk::{host_fn, plugin_fn, FnResult};
use serde::{Deserialize, Serialize};

/// Host-функция `log`, предоставляемая приложением.
#[host_fn]
extern "ExtismHost" {
  fn log(message: String);
}

/// Входные данные вызова.
#[derive(Deserialize)]
struct Request {
  title: String,
}

/// Выходные данные вызова.
#[derive(Serialize)]
struct Response {
  greeting: String,
}

/// Точка расширения: вызывается приложением при старте.
#[plugin_fn]
pub fn invoke(input: String) -> FnResult<String> {
  let parsed: Request = serde_json::from_str(&input)
    .unwrap_or_else(|_| Request { title: "читатель".to_string() });
  let response = Response {
    greeting: format!(
      "Привет, {}! Demo-плагин загружен и работает.",
      parsed.title
    ),
  };
  let payload = serde_json::to_string(&response)?;
  unsafe { log(payload.clone())? };
  extism_pdk::info!("demo-plugin invoke: {payload}");
  Ok(payload)
}