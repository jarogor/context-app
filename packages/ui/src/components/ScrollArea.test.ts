import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import ScrollArea from './ScrollArea.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('ScrollArea', () => {
  it('рендерит содержимое и показывает метку области', () => {
    render(ScrollArea, {
      props: { testId: 'area', children: text('содержимое') },
    });

    expect(screen.getByText('содержимое')).toBeTruthy();
    expect(screen.getByTestId('area')).toBeTruthy();
  });

  it('владеет вертикальной прокруткой области', () => {
    render(ScrollArea, { props: { testId: 'area', children: text('содержимое') } });

    const area = screen.getByTestId('area');
    expect(area.className).toContain('overflow-y-auto');
    expect(area.className).toContain('min-h-0');
    expect(area.className).toContain('flex-1');
  });

  it('объявляет себя контейнером для container-queries', () => {
    render(ScrollArea, { props: { testId: 'area', children: text('содержимое') } });

    // Раскладка вложенных областей должна считаться по ширине области, а не окна.
    expect(screen.getByTestId('area').className).toContain('@container');
  });

  it('накладывает дополнительные классы области', () => {
    render(ScrollArea, {
      props: { testId: 'area', class: 'bg-card', children: text('содержимое') },
    });

    expect(screen.getByTestId('area').className).toContain('bg-card');
  });
});
