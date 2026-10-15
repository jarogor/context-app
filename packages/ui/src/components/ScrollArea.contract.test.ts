import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import ScrollArea from './ScrollArea.svelte';

/** Сниппет с одним элементом. */
function content() {
  return createRawSnippet(() => ({ render: () => '<span>содержимое</span>' }));
}

describe('контракт прокрутки ScrollArea', () => {
  it('владеет полосой прокрутки, а вложенный контейнер — нет', () => {
    render(ScrollArea, { props: { testId: 'area', children: content() } });

    const area = screen.getByTestId('area');
    // Область — единственный владелец вертикальной прокрутки.
    expect(area.className).toContain('overflow-y-auto');

    // Вложенный контейнер прокруткой не владеет: иначе вторая полоса
    // перекрыла бы доступ к нижнему краю содержимого.
    const inner = area.firstElementChild as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.className).not.toContain('overflow-y-auto');
    expect(inner.className).not.toContain('overflow-auto');
  });

  it('при переполнении прокрутку берёт область содержимого', () => {
    render(ScrollArea, { props: { testId: 'area', children: content() } });

    const area = screen.getByTestId('area') as HTMLElement;
    // jsdom не считает раскладку: переполнение задаётся метриками напрямую.
    Object.defineProperty(area, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(area, 'scrollHeight', { value: 400, configurable: true });

    expect(area.scrollHeight).toBeGreaterThan(area.clientHeight);
    // Область объявлена прокручиваемой, поэтому переполнение разрешается
    // прокруткой этой же области, а не обрезкой.
    expect(area.className).toContain('overflow-y-auto');
  });
});
