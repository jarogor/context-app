// @vitest-environment jsdom
import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import ActionGroup from './ActionGroup.svelte';

/** Содержимое группы: две иконочные кнопки. */
function buttons() {
  return createRawSnippet(() => ({
    render: () => `
      <span>
        <button type="button" aria-label="Первое">1</button>
        <button type="button" aria-label="Второе">2</button>
      </span>
    `,
  }));
}

describe('ActionGroup', () => {
  it('объявляет группу действий доступным именем', () => {
    render(ActionGroup, {
      props: { ariaLabel: 'Действия над заметкой', testId: 'group', children: buttons() },
    });

    const group = screen.getByTestId('group');
    expect(group.getAttribute('role')).toBe('group');
    expect(group.getAttribute('aria-label')).toBe('Действия над заметкой');
  });

  it('держит кнопки внутри одной группы', () => {
    render(ActionGroup, {
      props: { ariaLabel: 'Действия', testId: 'group', children: buttons() },
    });

    // Кнопки не перерисовываются в кнопки группы: она только держит их рядом.
    expect(screen.getByTestId('group').querySelectorAll('button')).toHaveLength(2);
  });

  it('имеет высоту базового контрола, как у кнопок, полей и списков', () => {
    render(ActionGroup, {
      props: { ariaLabel: 'Действия', testId: 'group', children: buttons() },
    });

    expect(screen.getByTestId('group').className).toContain('h-9');
  });

  it('держит кнопки в общей подложке без рамки', () => {
    render(ActionGroup, {
      props: { ariaLabel: 'Действия', testId: 'group', children: buttons() },
    });

    const group = screen.getByTestId('group');
    expect(group.className).toContain('bg-[var(--control-surface)]');
    expect(group.className).not.toContain('border');
  });
});
