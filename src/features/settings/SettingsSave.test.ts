import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import SettingsPage from './SettingsPage.svelte';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(async () => () => {}),
}));

const invoke = vi.mocked(invokeCommand);

/** Ответ плагина настроек с одной секцией и заданным значением флага. */
function uiResponse(checked: boolean) {
  return {
    version: 1,
    spaces: [
      {
        space: 'settings.section',
        id: 'app.general',
        title: 'Общие',
        nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked } }],
      },
    ],
  };
}

const declaration = {
  space: 'settings.section',
  id: 'app.general',
  title: 'Общие',
  nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: false } }],
};

beforeEach(() => {
  invoke.mockReset();
});

describe('сохранение настроек не держит интерфейс', () => {
  it('гасит кнопку сразу, не дожидаясь ответа записи', async () => {
    // Дефект: кнопка сохранения ждала ответа плагина, и раздел нельзя было
    // закрыть, пока длится запись: интерфейс выглядел зависшим.
    // Запись не отвечает до явного разрешения.
    let release: (() => void) | undefined;
    invoke.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(uiResponse(true));
        }),
    );

    render(SettingsPage, {
      initialDeclarations: [{ declaration, diagnostics: [] }],
      initialError: '',
    });

    await fireEvent.click(screen.getByRole('checkbox'));
    const save = screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    await fireEvent.click(save);

    // Кнопка погасла, хотя запись ещё не завершилась: правки приняты сразу.
    await vi.waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    });

    release?.();
  });

  it('возвращает правки, если запись не удалась', async () => {
    // Неудачная запись не должна терять введённое молча: черновик
    // возвращается, кнопка снова активна.
    invoke.mockRejectedValue(new Error('нет связи'));

    render(SettingsPage, {
      initialDeclarations: [{ declaration, diagnostics: [] }],
      initialError: '',
    });

    await fireEvent.click(screen.getByRole('checkbox'));
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await vi.waitFor(() => {
      expect(
        (screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled,
      ).toBe(false);
    });
  });
});
