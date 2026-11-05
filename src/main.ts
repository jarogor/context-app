import { mount } from 'svelte';
import './app/app.css';
import Root from './app/Root.svelte';
import { applyAppPalette, applyAppTheme, readBootAppearance } from './features/appearance/theme';
import { showAppWindow } from './shared/window';
import { DEFAULT_PALETTE } from '@context/ui';

// До первого кадра применяется сохранённое оформление (зеркало из
// `localStorage`) или системная тема и палитра по умолчанию: экран загрузки не
// должен быть светлым при тёмной теме и мелькать чужой палитрой. Сохранённое
// оформление применяется на стадии бутстрапа, до показа оболочки.
const bootAppearance = readBootAppearance();
applyAppTheme(bootAppearance?.theme ?? 'system');
applyAppPalette(bootAppearance?.palette ?? DEFAULT_PALETTE);

// Статичный экран загрузки из index.html заменяется оболочкой: одновременно
// виден только один экран загрузки.
const target = document.getElementById('app')!;
target.replaceChildren();

const app = mount(Root, {
  target,
});

// Окно создано скрытым: показываем его после первой отрисовки, чтобы белый кадр
// webview не мелькнул до появления оформленного интерфейса. Передаётся
// применённая сторона темы: фон окна совпадёт с экраном загрузки, и показ окна
// не «переключит» сторону (см. `show_window` в ядре).
void showAppWindow(document.documentElement.dataset.theme ?? 'system');

export default app;
