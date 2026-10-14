//! Разделяемый runtime с фоновой сборкой и ожиданием готовности.
//!
//! Тяжёлая инициализация (загрузка и компиляция WASM-плагинов) выполняется в
//! отдельном потоке, а результат складывается в общий слот. Ожидание готовности
//! не удерживает общий замок состояния приложения: команда получает дескриптор
//! runtime под общим замком и сразу его отпускает, а ждёт только собственный
//! замок runtime. Поэтому лёгкие команды, не обращающиеся к runtime, остаются
//! доступными, пока фоновая сборка ещё идёт.

use std::sync::{Arc, Condvar, Mutex};

/// Состояние слота разделяемого runtime.
enum Slot<T> {
    /// Сборка ещё не завершена.
    Pending,
    /// Готовый runtime.
    Ready(T),
    /// Сборка завершилась ошибкой с сообщением.
    Failed(String),
}

/// Разделяемый runtime, собираемый в фоне и ожидаемый по готовности.
pub struct SharedRuntime<T> {
    /// Слот состояния и его собственный замок.
    slot: Mutex<Slot<T>>,
    /// Условная переменная готовности слота.
    ready: Condvar,
}

impl<T: Send + 'static> SharedRuntime<T> {
    /// Создание пустого слота без запуска сборки.
    ///
    /// Используется там, где результат кладётся вручную (тесты, внешний поток).
    pub fn pending() -> Arc<Self> {
        Arc::new(Self {
            slot: Mutex::new(Slot::Pending),
            ready: Condvar::new(),
        })
    }

    /// Создание слота и запуск фоновой сборки runtime.
    ///
    /// Сборка выполняется в отдельном потоке; паника сборки превращается в
    /// ошибку слота, чтобы ожидающие не зависли навсегда.
    pub fn spawn<F>(build: F) -> Arc<Self>
    where
        F: FnOnce() -> Result<T, String> + Send + 'static,
    {
        let shared = Self::pending();
        let handle = Arc::clone(&shared);
        std::thread::spawn(move || {
            let result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(build))
                .unwrap_or_else(|_| Err("сборка runtime завершилась паникой".to_string()));
            handle.fulfill(result);
        });
        shared
    }

    /// Запись результата сборки и пробуждение ожидающих.
    pub fn fulfill(&self, result: Result<T, String>) {
        if let Ok(mut slot) = self.slot.lock() {
            *slot = match result {
                Ok(value) => Slot::Ready(value),
                Err(error) => Slot::Failed(error),
            };
            self.ready.notify_all();
        }
    }

    /// Признак готовности слота без ожидания.
    #[cfg(test)]
    pub fn is_ready(&self) -> bool {
        self.slot
            .lock()
            .map(|slot| matches!(&*slot, Slot::Ready(_)))
            .unwrap_or(false)
    }
    /// Ожидание готовности runtime и выполнение действия над ним.
    ///
    /// Ожидание идёт на замке самого runtime, а не на общем замке состояния
    /// приложения. Ошибка сборки возвращается как результат команды.
    pub fn with_ready<R>(&self, action: impl FnOnce(&mut T) -> R) -> Result<R, String> {
        let mut guard = self.slot.lock().map_err(|error| error.to_string())?;
        loop {
            match &mut *guard {
                Slot::Ready(value) => {
                    return Ok(action(value));
                }
                Slot::Failed(error) => {
                    return Err(error.clone());
                }
                Slot::Pending => {
                    guard = self.ready.wait(guard).map_err(|error| error.to_string())?;
                }
            }
        }
    }
}

#[cfg(test)]
#[path = "shared_runtime_tests.rs"]
mod tests;
