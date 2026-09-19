# Library UI Plugin

Автономный frontend-проект library plugin.

Сборка:

```bash
npm install
npm run check
npm run build
```

Основное приложение не импортирует компоненты и модели этого проекта. При
сборке артефакт копируется в `public/plugins/library-ui/` и загружается через
generic plugin frame.
