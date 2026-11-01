import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
}));

import { invokeCommand } from '../../shared/app-bridge';
import SupportReportCard from './SupportReportCard.svelte';

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

describe('отчёт для поддержки', () => {
  it('собирает и сохраняет отчёт одним действием', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'support_report') {
        return { file_name: 'context-report.txt', content: 'отчёт' };
      }
      if (command === 'support_report_save') {
        return '/home/user/Загрузки/context-report.txt';
      }
      return null;
    });

    render(SupportReportCard);
    await fireEvent.click(screen.getByRole('button', { name: /Сохранить отчёт/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('support_report', {}));
    // Собранный отчёт уходит на сохранение целиком: пользователь не выбирает,
    // что приложить — файл содержит всё нужное для разбора.
    expect(invoke).toHaveBeenCalledWith('support_report_save', {
      report: { file_name: 'context-report.txt', content: 'отчёт' },
    });
    await waitFor(() =>
      expect(screen.getByTestId('support-report-saved').textContent).toContain(
        '/home/user/Загрузки/context-report.txt',
      ),
    );
  });

  it('не показывает путь, если сохранение отменили', async () => {
    invoke.mockImplementation(async (command: string) => {
      if (command === 'support_report') {
        return { file_name: 'context-report.txt', content: 'отчёт' };
      }
      return null;
    });

    render(SupportReportCard);
    await fireEvent.click(screen.getByRole('button', { name: /Сохранить отчёт/ }));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith('support_report_save', expect.anything()));
    expect(screen.queryByTestId('support-report-saved')).toBeNull();
  });

  it('сообщает об ошибке сборки отчёта', async () => {
    invoke.mockRejectedValue(new Error('журнал недоступен'));

    render(SupportReportCard);
    await fireEvent.click(screen.getByRole('button', { name: /Сохранить отчёт/ }));

    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toContain('журнал недоступен'),
    );
  });
});
