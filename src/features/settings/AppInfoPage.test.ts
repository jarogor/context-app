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

/** Снимок сведений о приложении. */
function infoResponse() {
  return {
    name: 'Текстура',
    version: '0.1.0',
    paths: [
      {
        key: 'app_state',
        title: 'Состояние приложения',
        path: '/data/app-state',
        note: 'Настройки, плагины, кеш и данные интерфейса',
      },
    ],
  };
}

describe('страница «Информация»', () => {
  it('показывает одно расположение без жаргона и деления плагинов', async () => {
    invoke.mockResolvedValue(infoResponse());

    render(AppInfoPage);

    await waitFor(() => expect(screen.getByText('Файлы приложения')).toBeTruthy());
    expect(screen.getByText('Состояние приложения')).toBeTruthy();
    expect(screen.getByText('/data/app-state')).toBeTruthy();
    // Деления плагинов и уровней в интерфейсе нет.
    expect(screen.queryByText('Плагины')).toBeNull();
    expect(screen.queryByText('Кэш плагинов')).toBeNull();
    expect(screen.queryByText(/в поставке/)).toBeNull();
    expect(screen.queryByText('Каркас')).toBeNull();
    expect(screen.queryByText('Приложение')).toBeNull();
  });

  it('показывает состояние ошибки вместо пустого экрана', async () => {
    invoke.mockRejectedValue(new Error('нет данных'));

    render(AppInfoPage);

    await waitFor(() => expect(screen.getByText('Error: нет данных')).toBeTruthy());
  });
});
