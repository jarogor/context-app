import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it } from 'vitest';

import SectionPanel from './SectionPanel.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('SectionPanel', () => {
  it('показывает заголовок и контекст раздела', () => {
    render(SectionPanel, { props: { title: 'Библиотека', subtitle: 'Демо-библиотека' } });

    expect(screen.getByText('Библиотека')).toBeTruthy();
    expect(screen.getByText('Демо-библиотека')).toBeTruthy();
  });

  it('показывает поиск и главное действие раздела', () => {
    render(SectionPanel, {
      props: { title: 'Рабочие места', search: text('поиск'), action: text('создать') },
    });

    expect(screen.getByText('поиск')).toBeTruthy();
    expect(screen.getByText('создать')).toBeTruthy();
  });

  it('без действия не показывает кнопок', () => {
    render(SectionPanel, { props: { title: 'Пусто' } });

    expect(screen.queryByRole('button')).toBeNull();
  });
});
