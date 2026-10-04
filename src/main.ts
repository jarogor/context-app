import { mount } from 'svelte';
import './app/app.css';
import Root from './app/Root.svelte';
import { applyAppPalette, applyAppTheme } from './features/appearance/theme';
import { showAppWindow } from './shared/window';
import { DEFAULT_PALETTE } from '@texture/ui';

// До первого кадра применяется системная тема и палитра по умолчанию: экран
// загрузки не должен быть светлым, если у пользователя тёмная тема ОС, и не
// должен мелькать чужой палитрой. Сохранённое оформление применится на стадии
// бутстрапа, до показа оболочки.
applyAppTheme('system');
applyAppPalette(DEFAULT_PALETTE);

// Статичный экран загрузки из index.html заменяется оболочкой: одновременно
// виден только один экран загрузки.
const target = document.getElementById('app')!;
target.replaceChildren();

const app = mount(Root, {
    target,
});

// Окно создано скрытым: показываем его после первой отрисовки, чтобы белый кадр
// webview не мелькнул до появления оформленного интерфейса.
void showAppWindow();

export default app;
