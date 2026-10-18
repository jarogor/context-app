## 1. Каркас фронтенд-проекта плагина

- [x] 1.1 Создать самостоятельный фронтенд-проект плагина в `src-wasm-plugins/workplace-pdf/frontend/`: собственные `package.json` (зависимости `vite`, `typescript`, `vitest`, `jsdom`, `pdfjs-dist`; скрипты `build`, `test`, `check`), `tsconfig.json`, `vite.config.ts` и `index.html`-шаблон. Проект не импортирует код, конфиги и пакеты оболочки (см. design.md D1); проверить, что `npm install` в корне ставит зависимости, а `npm run build -w workplace-pdf-viewer` из корня создаёт `src-wasm-plugins/workplace-pdf/viewer/index.html` и `viewer/viewer.js`.
- [x] 1.2 Настроить `vite.config.ts` как библиотечный ESM-бандл без code-splitting, с выводом в `../viewer`, и подключением бандла из шаблона через `textureViewerUrl('./viewer.js')`; проверить, что собранный `viewer/index.html` не содержит относительных ссылок и что `textureViewerUrl` из прелюдии даёт адрес бандла.
- [x] 1.3 Настроить vitest проекта (jsdom, поиск `src/**/*.test.ts`) и `check` (typecheck); проверить, что `npm run check -w workplace-pdf-viewer` и `npm test -w workplace-pdf-viewer` проходят на пустом наборе.

## 2. Развёртывание артефактов и конвейер плагинов

- [x] 2.1 Научить `scripts/plugin-artifacts.mjs` учитывать необязательный `exclude` из `bundle-assets.json` (для `build` и `check`); добавить `"exclude": ["frontend"]` в `src-wasm-plugins/workplace-pdf/bundle-assets.json`; проверить, что после сборки каталог `frontend/` не попадает в `src-tauri/resources/plugins/workplace-pdf/`, а `node scripts/plugin-artifacts.mjs check` проходит.
- [x] 2.2 Встроить сборку viewer в `scripts/build-wasm-plugins.sh` до `node scripts/plugin-artifacts.mjs build` и добавить сгенерированный `src-wasm-plugins/workplace-pdf/viewer/` в `.gitignore`; проверить сборку с нуля: `rm -rf src-wasm-plugins/workplace-pdf/viewer && bash scripts/build-wasm-plugins.sh` создаёт `viewer/index.html` в ресурсах, а `git status` не видит сгенерированное.
- [x] 2.3 Подключить проверки фронтенд-проекта плагина (typecheck и юнит-тесты) к `make verify` наравне с прочими проверками; проверить, что `make verify` доходит до запуска этих проверок.

## 3. Перенос логики в типизированные модули с тестами

- [x] 3.1 Вынести протокол и состояние (`CHANNEL`, `post`, разбор входящих сообщений, общие константы и переменные) в модуль `protocol`/`state` и добавить `*.test.ts` на разбор сообщений; проверить, что новые тесты проходят.
- [x] 3.2 Вынести тему области чтения и перекраску канваса (`applyReaderTheme`, `createPageColors`, `recolorCanvas`, `parseHexColor` и разбор тонов) в модуль `theme` и покрыть тестами чистые функции цвета; проверить прохождение тестов на светлой и тёмной стороне.
- [x] 3.3 Вынести отрисовку страниц и окон канваса (масштаб, `boundedRatio`, привязка к пиксельной сетке, расчёт окна видимой области, наблюдатель и планировщик) в модуль `render` и покрыть тестами чистые вычисления (`currentScale`, `snapToDevice`, `boundedRatio`, `desiredWindow`); проверить прохождение тестов.
- [x] 3.4 Вынести текстовый слой и совпадение с растром (`textContentWithPageFonts`, `isInvisibleScan`, `alignTextLayer`) в модуль `text-layer`; проверить, что поведение не изменилось браузерным сценарием `tests/e2e/pdf-reader.spec.ts` (сценарии совпадения слоя).
- [x] 3.5 Вынести живое выделение (`fractionRect`, `selectionRects`, `applyFillMask`, `renderSelection`, `handleSelection`) в модуль `selection` и покрыть тестами нарезку прямоугольников и построение маски; проверить прохождение тестов и неизменность вида — e2e-сценариями выделения.
- [x] 3.6 Вынести заметки всех типов и их правку (`drawNotes`, `drawTextCard`, `drawShape`, `parseGeometry`, `shapeHitElement`, перемещение и сдвиг границ цитаты) в модуль `notes`; покрыть тестами геометрию фигур, попадание по ним и нарезку рёбер цитаты; проверить прохождение тестов.
- [x] 3.7 Вынести обработку указателя и инструментов (жесты создания/перемещения/правки, курсор под инструментами) в модуль `gestures`; проверить неизменность поведения e2e-сценариями заметок и правки из `tests/e2e/pdf-reader.spec.ts`.
- [x] 3.8 Вынести оформление области в отдельный CSS-исходник и оставить `index.html`-шаблон только разметкой и подключением бандла; проверить, что собранный `viewer/index.html` содержит те же элементы (`#viewer`, `#pages`, `#status`) и оформление применяется.
- [x] 3.9 Собрать точку входа (`main.ts`): подписка на сообщения, наблюдатели размера и прокрутки, связывание модулей; проверить, что `npm run build -w workplace-pdf-viewer` проходит и приложение открывает PDF через плагин (e2e `tests/e2e/pdf-reader.spec.ts`).

## 4. Переключение владения и сквозные проверки

- [x] 4.1 Перевести владение точкой входа на сборку: убедиться, что `viewer/` полностью генерируется фронтенд-проектом, и по подтверждению пользователя удалить прежнее полотно `src-wasm-plugins/workplace-pdf/viewer/index.html`; проверить, что `git status` не содержит сгенерированных файлов, а манифест `viewer: "viewer/index.html"` указывает на собранный модуль.
- [x] 4.2 Прогнать браузерные сценарии чтения PDF и рабочего места (`npm run test:e2e`); проверить, что `tests/e2e/pdf-reader.spec.ts` и `tests/e2e/workplace-reader.spec.ts` проходят без правок ожиданий.
- [x] 4.3 Обновить локальную техсправку: отметить в `ROADMAP.md` (строка `reader-plugins`), что viewer разрабатывается как самостоятельный фронтенд плагина; проверить, что запись отражает новую структуру.
- [x] 4.4 Выполнить полный набор проверок `make verify` и убедиться, что все этапы (плагины, артефакты, тесты Rust и фронтенда, clippy/fmt, `npm run check`, модульные и e2e-тесты, сборка, `openspec validate --all`) проходят без ошибок и предупреждений.
