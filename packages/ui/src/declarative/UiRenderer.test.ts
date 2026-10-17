import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import UiRenderer from './UiRenderer.svelte';
import type { UiSpaceDeclaration } from '@texture/ui-schema';

/** Декларация секции настроек с флажком. */
function declaration(): UiSpaceDeclaration {
  return {
    space: 'settings.section',
    id: 'app.general',
    title: 'Общие',
    description: 'Общие параметры',
    nodes: [
      { type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: true } },
    ],
  };
}

describe('UiRenderer', () => {
  it('рисует заголовок группы, контрол и описание единой дизайн-системой', () => {
    render(UiRenderer, {
      props: { declaration: declaration(), showGroup: true, onintent: vi.fn() },
    });

    expect(screen.getByText('Общие')).toBeTruthy();
    expect(screen.getByText('Общие параметры')).toBeTruthy();
    expect(screen.getByRole('checkbox')).toBeTruthy();
  });

  it('рисует заголовок группы с линией-разделителем', () => {
    render(UiRenderer, {
      props: { declaration: declaration(), showGroup: true, onintent: vi.fn() },
    });

    // Строка сразу за текстом заголовка продолжает горизонтальная линия.
    const heading = screen.getByTestId('settings-group-heading');
    const line = heading.querySelector('[aria-hidden="true"]');
    expect(line).toBeTruthy();
    expect(line?.className).toContain('flex-1');
  });

  it('даёт телу группы отступ слева', () => {
    render(UiRenderer, {
      props: { declaration: declaration(), showGroup: true, onintent: vi.fn() },
    });

    expect(screen.getByTestId('settings-group-body').className).toContain('pl-4');
  });

  it('сообщает наружу текущие значения через onvalues', async () => {
    const onvalues = vi.fn();
    render(UiRenderer, { props: { declaration: declaration(), onintent: vi.fn(), onvalues } });

    await fireEvent.click(screen.getByRole('checkbox'));

    expect(onvalues).toHaveBeenLastCalledWith({ flag: false });
  });

  it('шлёт интент с изменённым значением только когда у узла есть действие', async () => {
    const onintent = vi.fn();
    const withAction: UiSpaceDeclaration = {
      ...declaration(),
      nodes: [
        {
          type: 'Checkbox',
          props: { name: 'flag', label: 'Флаг', checked: true },
          on: { change: 'save' },
        },
      ],
    };
    render(UiRenderer, { props: { declaration: withAction, onintent } });

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
    const withButton: UiSpaceDeclaration = {
      ...declaration(),
      nodes: [
        { type: 'Checkbox', props: { name: 'flag', label: 'Флаг', checked: true } },
        { type: 'Button', props: { label: 'Сохранить' }, on: { click: 'save' } },
      ],
    };
    render(UiRenderer, { props: { declaration: withButton, onintent } });

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

  it('выводит название поля акцентно', () => {
    render(UiRenderer, { props: { declaration: declaration(), onintent: vi.fn() } });

    // Название контрола — акцентным стилем, а не приглушённым серым текстом.
    const label = screen.getByText('Флаг').closest('label');
    expect(label?.className).toContain('font-medium');
    expect(label?.className).not.toContain('text-muted-foreground');
  });

  it('подсвечивает поле, отличающееся от сохранённой базы', () => {
    // Декларация содержит `flag: true`, а сохранённая база — `false`.
    render(UiRenderer, {
      props: { declaration: declaration(), onintent: vi.fn(), baseline: { flag: false } },
    });

    const label = screen.getByText('Флаг').closest('label');
    expect(label?.getAttribute('data-changed')).toBe('true');
    expect(label?.className).toContain('text-[var(--primary)]');
  });

  it('не подсвечивает поле, совпадающее с сохранённой базой', () => {
    render(UiRenderer, {
      props: { declaration: declaration(), onintent: vi.fn(), baseline: { flag: true } },
    });

    const label = screen.getByText('Флаг').closest('label');
    expect(label?.getAttribute('data-changed')).toBe('false');
    expect(label?.className).not.toContain('text-[var(--primary)]');
  });

  it('показывает пояснение поля компактно под контролом справа', () => {
    const withDescription: UiSpaceDeclaration = {
      space: 'settings.section',
      id: 'app.general',
      nodes: [
        {
          type: 'Input',
          props: { name: 'count', label: 'Количество', value: '5', description: 'Сколько штук' },
        },
      ],
    };
    render(UiRenderer, { props: { declaration: withDescription, onintent: vi.fn() } });

    const descriptionNode = screen.getByText('Сколько штук');
    expect(descriptionNode.className).toContain('text-xs');
    expect(descriptionNode.className).toContain('text-muted-foreground');
    // Пояснение стоит в одном блоке с полем после него, а не отдельным абзацем выше.
    const container = descriptionNode.closest('div');
    expect(container?.querySelector('input')).toBeTruthy();
    expect(descriptionNode.compareDocumentPosition(container!.querySelector('input')!) &
      Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
  });

  it('раскладывает поле двумя колонками на широком контейнере', () => {
    const withDescription: UiSpaceDeclaration = {
      space: 'settings.section',
      id: 'app.general',
      nodes: [
        { type: 'Input', props: { name: 'count', label: 'Количество', value: '5' } },
      ],
    };
    render(UiRenderer, { props: { declaration: withDescription, onintent: vi.fn() } });

    const label = screen.getByText('Количество').closest('label');
    const grid = label?.parentElement;
    expect(grid?.className).toContain('grid');
    expect(grid?.className).toContain('@min-[34rem]:grid-cols-');
  });

  it('не меняет вид заголовка секции и её описания как узлов', () => {
    const withSectionText: UiSpaceDeclaration = {
      space: 'settings.section',
      id: 'app.general',
      nodes: [
        { type: 'Heading', props: { text: 'Общие', level: 2 } },
        { type: 'Text', props: { text: 'Общие параметры' } },
      ],
    };
    render(UiRenderer, { props: { declaration: withSectionText, onintent: vi.fn() } });

    const heading = screen.getByRole('heading', { name: 'Общие' });
    expect(heading.className).toContain('text-base');
    expect(heading.className).toContain('font-semibold');
    const sectionText = screen.getByText('Общие параметры');
    expect(sectionText.className).toContain('text-muted-foreground');
    expect(sectionText.className).toContain('role-body');
  });
});
