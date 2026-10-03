import { mount } from 'svelte';
import './app.css';
import Root from './Root.svelte';
import { applyAppTheme } from './lib/theme';
import { showAppWindow } from './lib/window';

// До первого кадра применяется системная тема: экран загрузки не должен быть
// светлым, если у пользователя тёмная тема ОС. Сохранённое предпочтение
// применится на стадии бутстрапа, до показа оболочки.
applyAppTheme('system');

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
