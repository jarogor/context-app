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

  it('рисует приглушённую красную обводку опасной иконочной кнопки', () => {
    // Обводка «опасной» кнопки видна, но не кричит: красный смешан с общей
    // линией темы — как у соседних кнопок формы, только в тоне опасности.
    const children = createRawSnippet(() => ({ render: () => '<svg></svg>' }));

    render(Button, { props: { variant: 'ghost-danger', size: 'icon', children } });

    const classes = screen.getByRole('button').className;
    expect(classes).toContain('border-[var(--destructive-border)]');
    expect(classes).toContain('text-destructive');
  });
});
