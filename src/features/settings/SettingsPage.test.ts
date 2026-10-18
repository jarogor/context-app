import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
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
    spaces: [
      {
        space: 'settings.section',
        id: 'app.general',
        title: 'Общие',
        description: 'Общие параметры',
        nodes,
      },
    ],
  };
}

beforeEach(() => {
  invoke.mockReset();
});

describe('страница настроек из декларации', () => {
  it('рисует секцию из дерева ui-schema плагина', async () => {
    invoke.mockResolvedValue(
      uiResponse([
        {
          type: 'Checkbox',
          props: { name: 'flag', label: 'Приветственное уведомление', checked: true },
        },
      ]),
    );

    render(SettingsPage, {});

    await waitFor(() => {
      expect(screen.getByText('Общие')).toBeTruthy();
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
            nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: true } }],
          },
          diagnostics: [],
        },
      ],
      initialError: '',
    });

    expect(screen.getByText('Общие')).toBeTruthy();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('держит кнопку сохранения недоступной без правок', () => {
    render(SettingsPage, {
      initialDeclarations: [
        {
          declaration: {
            space: 'settings.section',
            id: 'app.general',
            title: 'Общие',
            nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: false } }],
          },
          diagnostics: [],
        },
      ],
      initialError: '',
    });

    const save = screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
  });

  it('включает кнопку сохранения после правки и гасит при возврате к исходному', async () => {
    render(SettingsPage, {
      initialDeclarations: [
        {
          declaration: {
            space: 'settings.section',
            id: 'app.general',
            title: 'Общие',
            nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: false } }],
          },
          diagnostics: [],
        },
      ],
      initialError: '',
    });

    const save = screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
    const checkbox = screen.getByRole('checkbox');

    await fireEvent.click(checkbox);
    expect(save.disabled).toBe(false);

    await fireEvent.click(checkbox);
    expect(save.disabled).toBe(true);
  });

  it('подсвечивает изменённое поле и снимает подсветку при возврате к исходному', async () => {
    render(SettingsPage, {
      initialDeclarations: [
        {
          declaration: {
            space: 'settings.section',
            id: 'app.general',
            title: 'Общие',
            nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: false } }],
          },
          diagnostics: [],
        },
      ],
      initialError: '',
    });

    const label = () => screen.getByText('Флаг').closest('label');
    expect(label()?.getAttribute('data-changed')).toBe('false');

    const checkbox = screen.getByRole('checkbox');
    await fireEvent.click(checkbox);
    expect(label()?.getAttribute('data-changed')).toBe('true');
    expect(label()?.className).toContain('text-[var(--primary)]');

    await fireEvent.click(checkbox);
    expect(label()?.getAttribute('data-changed')).toBe('false');
    expect(label()?.className).not.toContain('text-[var(--primary)]');
  });

  it('сохраняет все секции одной операцией и гасит кнопку', async () => {
    const declaration = {
      space: 'settings.section',
      id: 'app.general',
      title: 'Общие',
      nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: false } }],
    };
    invoke.mockResolvedValue({
      version: 1,
      spaces: [{ ...declaration, nodes: [{ type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: true } }] }],
    });

    render(SettingsPage, {
      initialDeclarations: [{ declaration, diagnostics: [] }],
      initialError: '',
    });

    await fireEvent.click(screen.getByRole('checkbox'));
    const save = screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);

    await fireEvent.click(save);

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
        capability: 'settings.store@1',
        operation: 'save',
        payload: { sections: [{ section: 'app.general', values: { flag: true } }] },
      });
    });
    await waitFor(() => {
      expect((screen.getByRole('button', { name: 'Сохранить' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });
  });
});
