import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import AppInfoPage from './AppInfoPage.svelte';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

/** Снимок сведений о приложении с расположениями обоих уровней. */
function infoResponse() {
  return {
    name: 'Текстура',
    version: '0.1.0',
    paths: [
      {
        key: 'framework_plugins',
        level: 'framework',
        title: 'Плагины каркаса в поставке',
        path: '/res/base-plugins',
        note: 'Служебные плагины каркаса',
      },
      {
        key: 'wasm_cache',
        level: 'framework',
        title: 'Кэш компиляции WASM',
        path: '/data/app-state/wasm-cache',
        note: 'Скомпилированные модули плагинов',
      },
      {
        key: 'app_state',
        level: 'application',
        title: 'Служебное состояние приложения',
        path: '/data/app-state',
        note: 'Реестры приложения',
      },
      {
        key: 'application_plugins',
        level: 'application',
        title: 'Плагины приложения в поставке',
        path: '/res/plugins',
        note: 'Источники книг, форматы, заметки',
      },
    ],
  };
}

describe('страница «Информация»', () => {
  it('разводит расположения каркаса и приложения', async () => {
    invoke.mockResolvedValue(infoResponse());

    render(AppInfoPage);

    await waitFor(() => expect(screen.getByText('Каркас')).toBeTruthy());
    expect(screen.getByText('Приложение')).toBeTruthy();

    const framework = screen.getByText('Каркас').closest('div') as HTMLElement;
    const application = screen.getByText('Приложение').closest('div') as HTMLElement;

    expect(framework.textContent).toContain('Плагины каркаса в поставке');
    expect(framework.textContent).toContain('Кэш компиляции WASM');
    expect(framework.textContent).not.toContain('Служебное состояние приложения');

    expect(application.textContent).toContain('Служебное состояние приложения');
    expect(application.textContent).toContain('Плагины приложения в поставке');
    expect(application.textContent).not.toContain('Кэш компиляции WASM');
  });

  it('показывает состояние ошибки вместо пустого экрана', async () => {
    invoke.mockRejectedValue(new Error('нет данных'));

    render(AppInfoPage);

    await waitFor(() => expect(screen.getByText('Error: нет данных')).toBeTruthy());
  });
});
