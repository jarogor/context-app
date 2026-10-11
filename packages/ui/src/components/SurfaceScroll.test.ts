import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import SurfaceScroll from './SurfaceScroll.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('SurfaceScroll', () => {
  it('рендерит содержимое и показывает метку области', () => {
    render(SurfaceScroll, {
      props: { testId: 'surface', children: text('содержимое') },
    });

    expect(screen.getByText('содержимое')).toBeTruthy();
    expect(screen.getByTestId('surface')).toBeTruthy();
  });

  it('владеет вертикальной прокруткой области', () => {
    render(SurfaceScroll, { props: { testId: 'surface', children: text('содержимое') } });

    const surface = screen.getByTestId('surface');
    expect(surface.className).toContain('overflow-y-auto');
    expect(surface.className).toContain('min-h-0');
    expect(surface.className).toContain('flex-1');
  });

  it('объявляет себя контейнером для container-queries', () => {
    render(SurfaceScroll, { props: { testId: 'surface', children: text('содержимое') } });

    // Раскладка вложенных поверхностей должна считаться по ширине области, а не окна.
    expect(screen.getByTestId('surface').className).toContain('@container');
  });

  it('накладывает дополнительные классы области', () => {
    render(SurfaceScroll, {
      props: { testId: 'surface', class: 'bg-card', children: text('содержимое') },
    });

    expect(screen.getByTestId('surface').className).toContain('bg-card');
  });
});
