import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import Skeleton from './Skeleton.svelte';

describe('Skeleton', () => {
  it('рисует заданное число строк-заглушек', () => {
    const { container } = render(Skeleton, { props: { rows: 4, testId: 'skeleton' } });

    const rows = container.querySelectorAll('[data-testid="skeleton"] > div');
    expect(rows.length).toBe(4);
  });

  it('объявляет состояние загрузки для вспомогательных технологий', () => {
    render(Skeleton, { props: { testId: 'skeleton' } });

    const status = screen.getByTestId('skeleton');
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-label')).toBe('Загрузка');
  });

  it('рисует хотя бы одну строку при нулевом значении', () => {
    const { container } = render(Skeleton, { props: { rows: 0, testId: 'skeleton' } });

    expect(container.querySelectorAll('[data-testid="skeleton"] > div').length).toBe(1);
  });
});
