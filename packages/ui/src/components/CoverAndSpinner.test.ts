import { render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import BookCoverPlaceholder from './BookCoverPlaceholder.svelte';
import Spinner from './Spinner.svelte';

describe('BookCoverPlaceholder', () => {
  it('рисует заглушку обложки и скрыт от доступности', () => {
    const { container } = render(BookCoverPlaceholder);

    const placeholder = container.firstElementChild as HTMLElement;
    expect(placeholder).toBeTruthy();
    expect(placeholder.getAttribute('aria-hidden')).toBe('true');
    expect(placeholder.querySelector('svg')).toBeTruthy();
  });
});

describe('Spinner', () => {
  it('рисует анимированный индикатор', () => {
    const { container } = render(Spinner);

    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    expect(svg?.classList.contains('animate-spin')).toBe(true);
  });
});
