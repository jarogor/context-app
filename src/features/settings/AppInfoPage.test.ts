import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
    name: 'Контекст',
    version: '0.1.0',
    paths: [
      {
        key: 'app_data',
        title: 'app.settings.data.title',
        path: '/data/context',
        note: 'app.settings.data.note',
      },
      {
        key: 'diagnostics',
        title: 'app.settings.logs.title',
        path: '/data/context/app-state/diagnostics.log',
        note: '',
      },
    ],
  };
}

describe('сведения о приложении', () => {
  it('показывает одно расположение без жаргона и деления плагинов', async () => {
    invoke.mockResolvedValue(infoResponse());

    render(AppInfoPage);

    await waitFor(() =>
      expect(screen.getByText('Служебные данные приложения')).toBeTruthy(),
    );
    expect(screen.getByText('/data/context')).toBeTruthy();
    // Деления плагинов и уровней в интерфейсе нет.
    expect(screen.queryByText('Плагины')).toBeNull();
    expect(screen.queryByText('Кэш плагинов')).toBeNull();
    expect(screen.queryByText(/в поставке/)).toBeNull();
    expect(screen.queryByText('Каркас')).toBeNull();
    expect(screen.queryByText('Приложение')).toBeNull();
  });

  it('показывает путь к логам и выгружает их', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'app_info') {
        return infoResponse();
      }
      if (command === 'support_report') {
        return { file_name: 'logs.txt', content: 'журнал' };
      }
      if (command === 'support_report_save') {
        return '/home/user/logs.txt';
      }
      return null;
    });

    render(AppInfoPage);
    await waitFor(() => expect(screen.getByText('/data/context/app-state/diagnostics.log')).toBeTruthy());
    // Журнал — второй файл в том же списке, со своими действиями.
    expect(screen.getByText('Логи')).toBeTruthy();

    await fireEvent.click(screen.getByRole('button', { name: /Экспорт/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('support_report', {}));
    await waitFor(() =>
      expect(screen.getByTestId('support-report-saved').textContent).toContain('/home/user/logs.txt'),
    );
  });

  it('открывает папку с логами', async () => {
    invoke.mockResolvedValue(infoResponse());

    render(AppInfoPage);
    await waitFor(() => expect(screen.getByText('Логи')).toBeTruthy());

    await fireEvent.click(screen.getByRole('button', { name: 'Открыть' }));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith('diagnostics_open_folder', {}),
    );
  });

  it('показывает состояние ошибки вместо пустого экрана', async () => {
    invoke.mockRejectedValue(new Error('нет данных'));

    render(AppInfoPage);

    await waitFor(() => expect(screen.getByText('Error: нет данных')).toBeTruthy());
  });
});
