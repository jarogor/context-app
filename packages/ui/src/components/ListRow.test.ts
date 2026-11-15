import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';

import ListRow from './ListRow.svelte';

/** Сниппет с заданным текстом. */
function text(value: string) {
  return createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));
}

describe('ListRow', () => {
  it('показывает название, метаинформацию и действия', () => {
    render(ListRow, {
      props: {
        testId: 'row',
        titleContent: text('Название'),
        meta: text('01.01.2024'),
        actions: text('меню'),
      },
    });

    expect(screen.getByText('Название')).toBeTruthy();
    expect(screen.getByText('01.01.2024')).toBeTruthy();
    expect(screen.getByText('меню')).toBeTruthy();
    expect(screen.getByTestId('row')).toBeTruthy();
  });

  it('сообщает о выборе пункта', async () => {
    const onclick = vi.fn();

    render(ListRow, {
      props: { testId: 'row', titleContent: text('Название'), onclick },
    });

    await fireEvent.click(screen.getByRole('button'));

    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('отмечает выбранный пункт', () => {
    render(ListRow, {
      props: { testId: 'row', titleContent: text('Название'), selected: true },
    });

    expect(screen.getByRole('button').getAttribute('aria-current')).toBe('true');
    expect(screen.getByTestId('row').getAttribute('data-selected')).toBe('true');
  });

  it('подсвечивает при наведении всю строку, а не внутреннюю кнопку', () => {
    render(ListRow, {
      props: { testId: 'row', titleContent: text('Название'), onclick: vi.fn() },
    });

    const row = screen.getByTestId('row');
    const button = screen.getByRole('button');
    // Фон наведения — на самой строке, кнопка его не несёт: иначе подсвечивалась
    // бы только часть пункта, а не вся строка целиком.
    expect(row.className).toContain('hover:bg');
    expect(button.className).not.toContain('hover:bg');
  });

  it('не рисует собственный контур: у списка уже есть обводка', () => {
    // Второй контур рядом с обводкой списка читался двойной рамкой и перекрывал
    // скругление, поэтому строка своего контура не рисует.
    render(ListRow, {
      props: {
        testId: 'row',
        titleContent: text('Название'),
        onclick: vi.fn(),
        selected: true,
      },
    });

    const row = screen.getByTestId('row');
    expect(row.className).not.toContain('shadow-[inset');
    expect(row.className).not.toContain('border');
  });

  it('берёт подпись выбранной строки из подписи плотной заливки', () => {
    // Дефект: на выбранной строке подпись бралась только у тихой ступени, и на
    // плотной заливке она сливалась с фоном (тёмное на глубоком синем).
    render(ListRow, {
      props: {
        testId: 'row',
        titleContent: text('Название'),
        selected: true,
        style: '--row-ink: #1c1608; --row-ink-selected: #fffdf6',
      },
    });

    const row = screen.getByTestId('row');
    expect(row.className).toContain('text-[var(--row-ink-selected,inherit)]');
    // Вторичный текст следует той же подписи, что и название.
    expect(row.getAttribute('style')).toContain('--meta-ink: var(--row-ink-selected');
  });

  it('оставляет наведение в семье цвета строки', () => {
    // Дефект: цветная строка под курсором становилась серой темой, и её подпись
    // под заливку не подходила.
    render(ListRow, {
      props: {
        testId: 'row',
        titleContent: text('Название'),
        onclick: vi.fn(),
        style: '--row-fill: #afd2ff; --row-fill-hover: #82b9ff',
      },
    });

    const row = screen.getByTestId('row');
    expect(row.className).toContain('hover:bg-[var(--row-fill-hover,var(--surface-hover))]');
  });

  it('не задаёт подпись вторичного текста строке без оформления', () => {
    // Без цвета фон и подпись берут классы: лишние переменные оставили бы
    // строке подкраску, которой у нецветной записи быть не должно.
    render(ListRow, {
      props: { testId: 'row', titleContent: text('Название') },
    });

    expect(screen.getByTestId('row').getAttribute('style')).toBeNull();
  });
});
