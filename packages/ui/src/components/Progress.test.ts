import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Progress from './Progress.svelte';

describe('Progress', () => {
  it('показывает долю выполнения в процентах', () => {
    render(Progress, { props: { value: 42 } });

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('42');
  });

  it('ограничивает значение диапазоном 0–100', () => {
    render(Progress, { props: { value: 150 } });

    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('100');
  });
});
