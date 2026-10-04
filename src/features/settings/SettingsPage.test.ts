import { render, screen, waitFor } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import SettingsPage from './SettingsPage.svelte';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
  listenEvent: vi.fn(async () => () => {}),
}));

const invoke = vi.mocked(invokeCommand);

/** Ответ плагина настроек с одной секцией. */
function uiResponse(nodes: unknown[]) {
  return {
    version: 1,
    spaces: [{ space: 'settings.section', id: 'app.general', title: 'Общие', nodes }],
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe('страница настроек из декларации', () => {
  it('рисует секцию из дерева ui-schema плагина', async () => {
    invoke.mockResolvedValue(
      uiResponse([
        { type: 'Heading', props: { text: 'Общие', level: 2 } },
        {
          type: 'Checkbox',
          props: { name: 'flag', label: 'Приветственное уведомление', checked: true },
          on: { change: 'save' },
        },
      ]),
    );

    render(SettingsPage, {});

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Общие' })).toBeTruthy();
    });
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByText('Приветственное уведомление')).toBeTruthy();
  });

  it('показывает пустое состояние без деклараций', async () => {
    invoke.mockResolvedValue({ version: 1, spaces: [] });

    render(SettingsPage, {});

    await waitFor(() => {
      expect(screen.getByText('Нет зарегистрированных настроек')).toBeTruthy();
    });
  });

  it('сообщает о несовместимой версии схемы', async () => {
    invoke.mockResolvedValue({ version: 999, spaces: [] });

    render(SettingsPage, {});

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Несовместимая версия');
    });
  });

  it('рисует декларации, загруженные на бутстрапе, без обращения к плагину', () => {
    render(SettingsPage, {
      initialDeclarations: [
        {
          declaration: {
            space: 'settings.section',
            id: 'app.general',
            title: 'Общие',
            nodes: [{ type: 'Heading', props: { text: 'Общие', level: 2 } }],
          },
          diagnostics: [],
        },
      ],
      initialError: '',
    });

    expect(screen.getByRole('heading', { name: 'Общие' })).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });
});
