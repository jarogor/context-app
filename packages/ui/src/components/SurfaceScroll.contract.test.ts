import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import SurfaceScroll from './SurfaceScroll.svelte';

/** Сниппет с одним элементом. */
function content() {
  return createRawSnippet(() => ({ render: () => '<span>содержимое</span>' }));
}

describe('контракт прокрутки SurfaceScroll', () => {
  it('владеет полосой прокрутки, а вложенный контейнер — нет', () => {
    render(SurfaceScroll, { props: { testId: 'surface', children: content() } });

    const surface = screen.getByTestId('surface');
    // Область — единственный владелец вертикальной прокрутки.
    expect(surface.className).toContain('overflow-y-auto');

    // Вложенный контейнер прокруткой не владеет: иначе вторая полоса
    // перекрыла бы доступ к нижнему краю содержимого.
    const inner = surface.firstElementChild as HTMLElement;
    expect(inner).toBeTruthy();
    expect(inner.className).not.toContain('overflow-y-auto');
    expect(inner.className).not.toContain('overflow-auto');
  });

  it('при переполнении прокрутку берёт область поверхности', () => {
    render(SurfaceScroll, { props: { testId: 'surface', children: content() } });

    const surface = screen.getByTestId('surface') as HTMLElement;
    // jsdom не считает раскладку: переполнение задаётся метриками напрямую.
    Object.defineProperty(surface, 'clientHeight', { value: 100, configurable: true });
    Object.defineProperty(surface, 'scrollHeight', { value: 400, configurable: true });

    expect(surface.scrollHeight).toBeGreaterThan(surface.clientHeight);
    // Область объявлена прокручиваемой, поэтому переполнение разрешается
    // прокруткой этой же области, а не обрезкой.
    expect(surface.className).toContain('overflow-y-auto');
  });
});
