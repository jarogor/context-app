import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import MetaList from './MetaList.svelte';

describe('MetaList', () => {
  it('показывает значения с подписями', () => {
    render(MetaList, {
      props: {
        items: [
          { icon: 'calendar', value: '01.01.2024 10:00' },
          { value: 'текущее', strong: true },
        ],
      },
    });

    expect(screen.getByText('01.01.2024 10:00')).toBeTruthy();
    expect(screen.getByText('текущее')).toBeTruthy();
  });

  it('показывает значение без подписи', () => {
    render(MetaList, { props: { items: [{ value: 'Автор' }] } });

    expect(screen.getByText('Автор')).toBeTruthy();
  });

  it('обводит метку приглушённым цветом текста', () => {
    render(MetaList, {
      props: {
        items: [{ badge: 'PDF', value: 'книга.pdf' }],
      },
    });

    const badge = screen.getByTestId('meta-badge');
    expect(badge.textContent).toBe('PDF');
    expect(badge.className).toContain('border-current/40');
  });
});
