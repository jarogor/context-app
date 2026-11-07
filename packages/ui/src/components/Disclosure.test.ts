import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import Disclosure from './Disclosure.svelte';

/** Содержимое раздела. */
const children = createRawSnippet(() => ({
  render: () => '<span>Тестовый автор</span>',
}));

describe('Disclosure', () => {
  it('закрыт по умолчанию и раскрывается нажатием заголовка', async () => {
    render(Disclosure, { props: { title: 'Основное', children } });

    expect(screen.queryByText('Тестовый автор')).toBeNull();
    const header = screen.getByRole('button', { name: 'Основное' });
    expect(header.getAttribute('aria-expanded')).toBe('false');

    await fireEvent.click(header);

    expect(screen.getByText('Тестовый автор')).toBeTruthy();
    expect(header.getAttribute('aria-expanded')).toBe('true');
  });
});
