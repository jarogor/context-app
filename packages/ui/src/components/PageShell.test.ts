import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import PageShell from './PageShell.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('PageShell', () => {
  it('показывает шапку, полосу управления и содержимое', () => {
    render(PageShell, {
      props: {
        eyebrow: 'Точка входа',
        title: 'Раздел',
        controls: text('управление'),
        children: text('список'),
        testId: 'page',
      },
    });

    expect(screen.getByText('управление')).toBeTruthy();
    expect(screen.getByText('список')).toBeTruthy();
    expect(screen.getByTestId('page')).toBeTruthy();
    expect(screen.getByTestId('page-title').textContent).toContain('Раздел');
    expect(screen.getByTestId('page-controls')).toBeTruthy();
  });

  it('показывает состояние загрузки вместо содержимого', () => {
    render(PageShell, {
      props: {
        loading: true,
        loadingText: 'Загрузка…',
        children: text('список'),
      },
    });

    expect(screen.getByText('Загрузка…')).toBeTruthy();
    expect(screen.queryByText('список')).toBeNull();
  });

  it('показывает состояние ошибки', () => {
    render(PageShell, { props: { error: 'сбой', errorTestId: 'err' } });

    expect(screen.getByTestId('err').textContent).toContain('сбой');
  });

  it('показывает кнопку повтора при обработчике', () => {
    render(PageShell, { props: { error: 'сбой', onRetry: () => {} } });

    expect(screen.getByRole('button', { name: 'Повторить' })).toBeTruthy();
  });

  it('показывает пустое состояние вместо содержимого', () => {
    render(PageShell, {
      props: {
        empty: true,
        emptyText: 'Пусто',
        children: text('список'),
      },
    });

    expect(screen.getByText('Пусто')).toBeTruthy();
    expect(screen.queryByText('список')).toBeNull();
  });
});
