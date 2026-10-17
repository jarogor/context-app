import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import EmptyState from './EmptyState.svelte';

describe('EmptyState', () => {
  it('показывает заголовок и пояснение', () => {
    render(EmptyState, {
      props: { title: 'Ничего нет', description: 'Создайте первый элемент' },
    });

    expect(screen.getByText('Ничего нет')).toBeTruthy();
    expect(screen.getByText('Создайте первый элемент')).toBeTruthy();
  });

  it('без пояснения показывает только заголовок', () => {
    render(EmptyState, { props: { title: 'Пусто' } });

    expect(screen.getByText('Пусто')).toBeTruthy();
  });

  it('отдаёт метку для тестов', () => {
    render(EmptyState, { props: { title: 'Пусто', testId: 'empty' } });

    expect(screen.getByTestId('empty')).toBeTruthy();
  });
});
