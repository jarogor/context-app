import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import Button from './Button.svelte';

describe('Button', () => {
  it('рендерит содержимое и вызывает обработчик нажатия', () => {
    const onclick = vi.fn();
    const children = createRawSnippet(() => ({ render: () => '<span>Сохранить</span>' }));

    render(Button, { props: { onclick, children } });

    const button = screen.getByRole('button');
    expect(button).toBeTruthy();
    expect(screen.getByText('Сохранить')).toBeTruthy();

    button.click();
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('красит опасную иконочную кнопку в тон опасности без обводки', () => {
    const children = createRawSnippet(() => ({ render: () => '<svg></svg>' }));

    render(Button, { props: { variant: 'ghost-danger', size: 'icon', children } });

    const classes = screen.getByRole('button').className;
    expect(classes).toContain('text-destructive');
    expect(classes).not.toContain('border');
  });
});
