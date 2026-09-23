## 1. Сброс журнала при старте

- [x] 1.1 Добавить `AppPluginHost::reset_notifications()`: вызвать операцию `clear` у провайдера capability `notifications.journal@1`, безвредно при отсутствии провайдера; покрыть тестом в `app_host_tests.rs` (после сброса журнал пуст)
- [x] 1.2 Вызвать `reset_notifications` в `lib.rs` после загрузки базовых плагинов и до записи событий загрузки; проверить `cargo test`

## 2. Спека, очистка и проверки

- [x] 2.1 Удалить неиспользуемую `plugins/notifications-ui/src/NotificationsPage.svelte`
- [x] 2.2 Обновить основную спеку `notifications` (журнал в пределах сессии); проверить `openspec validate --all`
- [x] 2.3 Выполнить `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --all -- --check`, `npm run check`, `npm run build`
