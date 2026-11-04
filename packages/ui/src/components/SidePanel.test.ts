import { render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import SidePanel from './SidePanel.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('SidePanel', () => {
  it('показывает заголовок и содержимое', () => {
    render(SidePanel, {
      props: { title: 'Панель', children: text('список'), testId: 'panel' },
    });

    expect(screen.getByText('Панель')).toBeTruthy();
    expect(screen.getByText('список')).toBeTruthy();
    expect(screen.getByTestId('panel')).toBeTruthy();
  });

  it('задаёт ширину панели классом потребителя', () => {
    render(SidePanel, {
      props: { title: 'Панель', class: 'w-[18rem]', testId: 'panel' },
    });

    expect(screen.getByTestId('panel').className).toContain('w-[18rem]');
  });

  it('использует фон панели, отделённый от фона области', () => {
    render(SidePanel, { props: { title: 'Панель', testId: 'panel' } });

    expect(screen.getByTestId('panel').className).toContain('bg-[var(--panel)]');
  });

  it('показывает поиск только при наличии', () => {
    render(SidePanel, { props: { title: 'Панель', search: text('поиск') } });

    expect(screen.getByText('поиск')).toBeTruthy();
  });

  it('отделяет левую панель границей справа', () => {
    render(SidePanel, { props: { title: 'Панель', side: 'left', testId: 'panel' } });

    const panel = screen.getByTestId('panel');
    expect(panel.getAttribute('data-side')).toBe('left');
    expect(panel.className).toContain('border-r');
    expect(panel.className).not.toContain('border-l');
  });

  it('показывает кнопку закрытия на узком окне, когда задан обработчик', () => {
    const onClose = vi.fn();
    render(SidePanel, { props: { title: 'Панель', onClose, testId: 'panel' } });

    const close = screen.getByTestId('side-panel-close');
    close.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('закрывает панель крестиком, а не стрелкой', () => {
    // Стрелка читалась как «вернуться» и сбивала: действие закрытия обозначается
    // крестиком, как и в остальных слоях интерфейса. Путь крестика —
    // `M6 6l12 12M18 6 6 18`, у шевронов он другой.
    render(SidePanel, { props: { title: 'Панель', onClose: vi.fn(), testId: 'panel' } });

    const path = screen.getByTestId('side-panel-close').querySelector('path');
    expect(path?.getAttribute('d')).toBe('M6 6l12 12M18 6 6 18');
  });

  it('не показывает кнопку закрытия без обработчика', () => {
    render(SidePanel, { props: { title: 'Панель', testId: 'panel' } });

    expect(screen.queryByTestId('side-panel-close')).toBeNull();
  });

  it('ставит вкладки над поиском, чтобы поиск не сдвигал их основание', () => {
    render(SidePanel, {
      props: { title: 'Панель', tabs: text('вкладки'), search: text('поиск'), testId: 'panel' },
    });

    const tabs = screen.getByText('вкладки');
    const search = screen.getByText('поиск');
    // Вкладки обязаны стоять в разметке раньше поиска: иначе появление поля
    // поиска у соседней вкладки сдвигало бы полосу кнопок вниз.
    expect(tabs.parentElement!.compareDocumentPosition(search)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('держит полосу вкладок на месте при скрытии поиска', () => {
    const { rerender } = render(SidePanel, {
      props: { title: 'Панель', tabs: text('вкладки'), testId: 'panel' },
    });
    const withoutSearch = screen.getByText('вкладки').getBoundingClientRect().top;

    rerender({
      title: 'Панель',
      tabs: text('вкладки'),
      search: text('поиск'),
      testId: 'panel',
    });

    // Положение полосы вкладок не зависит от наличия поиска.
    expect(screen.getByText('вкладки').getBoundingClientRect().top).toBe(withoutSearch);
  });
});
