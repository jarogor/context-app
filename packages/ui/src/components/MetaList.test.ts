import { render, screen } from '@testing-library/svelte';
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

  it('ставит метку на подложку из цвета строки', () => {
    render(MetaList, {
      props: {
        items: [{ badge: 'PDF', value: 'книга.pdf' }],
      },
    });

    const badge = screen.getByTestId('meta-badge');
    expect(badge.textContent).toBe('PDF');
    // Подложка — нейтральная врезка системы: на цветном тексте подложка из
    // `currentColor` съедала контраст подписи, и метка становилась нечитаемой.
    expect(badge.className).toContain('bg-[var(--code-surface)]');
    expect(badge.className).not.toContain('border');
  });
});
