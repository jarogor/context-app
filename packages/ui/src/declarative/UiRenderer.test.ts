import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import UiRenderer from './UiRenderer.svelte';
import type { UiSpaceDeclaration } from '@texture/ui-schema';

/** Декларация секции настроек с флажком и кнопкой сохранения. */
function declaration(): UiSpaceDeclaration {
  return {
    space: 'settings.section',
    id: 'app.general',
    title: 'Общие',
    nodes: [
      { type: 'Heading', props: { text: 'Общие', level: 2 } },
      {
        type: 'Checkbox',
        props: { name: 'flag', label: 'Флаг', checked: true },
        on: { change: 'save' },
      },
      {
        type: 'Button',
        props: { label: 'Сохранить' },
        on: { click: 'save' },
      },
    ],
  };
}

describe('UiRenderer', () => {
  it('рисует заголовок, контрол и кнопку единой дизайн-системой', () => {
    render(UiRenderer, { props: { declaration: declaration(), onintent: vi.fn() } });

    expect(screen.getByRole('heading', { name: 'Общие' })).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeTruthy();
  });

  it('шлёт интент с изменённым значением при переключении флажка', async () => {
    const onintent = vi.fn();
    render(UiRenderer, { props: { declaration: declaration(), onintent } });

    await fireEvent.click(screen.getByRole('checkbox'));

    expect(onintent).toHaveBeenCalledWith({
      space: 'settings.section',
      id: 'app.general',
      action: 'save',
      values: { flag: false },
    });
  });

  it('шлёт интент со снимком значений по кнопке', async () => {
    const onintent = vi.fn();
    render(UiRenderer, { props: { declaration: declaration(), onintent } });

    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onintent).toHaveBeenCalledWith({
      space: 'settings.section',
      id: 'app.general',
      action: 'save',
      values: { flag: true },
    });
  });

  it('показывает диагностику отклонённых узлов', () => {
    render(UiRenderer, {
      props: { declaration: declaration(), onintent: vi.fn(), diagnostics: ['компонент не разрешён: Mega'] },
    });

    expect(screen.getByRole('status').textContent).toContain('компонент не разрешён: Mega');
  });
});
