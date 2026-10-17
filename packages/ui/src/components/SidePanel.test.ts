import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import SidePanel from './SidePanel.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('SidePanel', () => {
  it('показывает заголовок и содержимое', () => {
    render(SidePanel, {
      props: { title: 'Панель', children: text('список'), testId: 'panel' },
    });

    expect(screen.getByText('Панель')).toBeTruthy();
    expect(screen.getByText('список')).toBeTruthy();
    expect(screen.getByTestId('panel')).toBeTruthy();
  });

  it('задаёт ширину панели классом потребителя', () => {
    render(SidePanel, {
      props: { title: 'Панель', class: 'w-[18rem]', testId: 'panel' },
    });

    expect(screen.getByTestId('panel').className).toContain('w-[18rem]');
  });

  it('использует фон панели, отделённый от фона области', () => {
    render(SidePanel, { props: { title: 'Панель', testId: 'panel' } });

    expect(screen.getByTestId('panel').className).toContain('bg-[var(--panel)]');
  });

  it('показывает поиск только при наличии', () => {
    render(SidePanel, { props: { title: 'Панель', search: text('поиск') } });

    expect(screen.getByText('поиск')).toBeTruthy();
  });
});
