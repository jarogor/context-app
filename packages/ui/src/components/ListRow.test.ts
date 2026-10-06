import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import ListRow from './ListRow.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('ListRow', () => {
  it('показывает название, метаинформацию и действия', () => {
    render(ListRow, {
      props: {
        testId: 'row',
        titleContent: text('Название'),
        meta: text('01.01.2024'),
        actions: text('меню'),
      },
    });

    expect(screen.getByText('Название')).toBeTruthy();
    expect(screen.getByText('01.01.2024')).toBeTruthy();
    expect(screen.getByText('меню')).toBeTruthy();
    expect(screen.getByTestId('row')).toBeTruthy();
  });

  it('сообщает о выборе пункта', async () => {
    const onclick = vi.fn();

    render(ListRow, {
      props: { testId: 'row', titleContent: text('Название'), onclick },
    });

    await fireEvent.click(screen.getByRole('button'));

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('отмечает выбранный пункт', () => {
    render(ListRow, {
      props: { testId: 'row', titleContent: text('Название'), selected: true },
    });

    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('row').getAttribute('data-selected')).toBe('true');
  });
});
