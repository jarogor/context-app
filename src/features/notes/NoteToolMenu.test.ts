import { fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import NoteToolMenu from './NoteToolMenu.svelte';
import { DEFAULT_NOTE_TOOL, NOTE_TYPES, type NoteTool } from './notes';
import { dismissTopLayer, resetDismissLayers } from '../hotkeys/dismiss-layer';

/** Отрисовка меню с инструментом по умолчанию. */
function renderMenu(props: Record<string, unknown> = {}) {
  const onToolChange = vi.fn();
  render(NoteToolMenu, {
    props: {
      tool: DEFAULT_NOTE_TOOL,
      allowedTypes: NOTE_TYPES,
      onToolChange,
      ...props,
    },
  });
  return { onToolChange };
}

/** Открытие меню кнопкой. */
async function openMenu() {
  await fireEvent.click(screen.getByTestId('note-tool-toggle'));
}

afterEach(() => {
  resetDismissLayers();
});

describe('меню инструмента заметок в области чтения', () => {
  it('раскрывается той же кнопкой, которая потом закрывает меню', async () => {
    const { onToolChange } = renderMenu();

    expect(screen.queryByTestId('note-tool-menu')).toBeNull();
    await openMenu();
    expect(screen.getByTestId('note-tool-menu')).toBeTruthy();
    // Кнопка закрытия стоит на месте кнопки открытия.
    expect(screen.queryByTestId('note-tool-toggle')).toBeNull();
    expect(screen.getByTestId('note-tool-close')).toBeTruthy();

    await fireEvent.click(screen.getByTestId('note-tool-close'));
    expect(screen.queryByTestId('note-tool-menu')).toBeNull();
    expect(screen.getByTestId('note-tool-toggle')).toBeTruthy();
    // Инструмент вернулся к цитате.
    expect(onToolChange).not.toHaveBeenCalled();
  });

  it('выбор типа не закрывает меню', async () => {
    const { onToolChange } = renderMenu();
    await openMenu();

    await fireEvent.click(screen.getByRole('button', { name: 'Текст' }));

    expect(onToolChange).toHaveBeenCalledWith({ ...DEFAULT_NOTE_TOOL, type: 'text' });
    // Меню остаётся открытым: следом можно поставить заметку.
    expect(screen.getByTestId('note-tool-menu')).toBeTruthy();
  });

  it('у фигуры показывает виды фигур рядом иконок без подписей', async () => {
    const tool: NoteTool = { ...DEFAULT_NOTE_TOOL, type: 'shape' };
    const { onToolChange } = renderMenu({ tool });
    await openMenu();

    const shapes = screen.getByTestId('note-tool-shape');
    // Подписи не выводятся текстом: иконки понятны, а текст — только подсказка.
    expect(shapes.textContent?.trim()).toBe('');
    const buttons = Array.from(shapes.querySelectorAll('button'));
    expect(buttons).toHaveLength(3);
    // Все виды в одном ряду.
    const tops = new Set(buttons.map((button) => Math.round(button.getBoundingClientRect().top)));
    expect(tops.size).toBe(1);
    expect(buttons.map((button) => button.getAttribute('title'))).toEqual([
      'Линия',
      'Рамка',
      'Эллипс',
    ]);

    await fireEvent.click(screen.getByRole('button', { name: 'Эллипс' }));
    expect(onToolChange).toHaveBeenCalledWith({ ...tool, shape: 'ellipse' });
    expect(screen.getByTestId('note-tool-menu')).toBeTruthy();
  });

  it('закрытие кнопкой сбрасывает тип на цитату', async () => {
    const tool: NoteTool = { ...DEFAULT_NOTE_TOOL, type: 'shape', shape: 'ellipse', color: 'blue' };
    const { onToolChange } = renderMenu({ tool });
    await openMenu();

    await fireEvent.click(screen.getByTestId('note-tool-close'));

    // Цвет и вид фигуры сохраняются: сбрасывается только тип.
    expect(onToolChange).toHaveBeenCalledWith({ ...tool, type: 'quote' });
  });

  it('закрывается по Escape и тоже сбрасывает тип', async () => {
    const tool: NoteTool = { ...DEFAULT_NOTE_TOOL, type: 'text' };
    const { onToolChange } = renderMenu({ tool });
    await openMenu();

    expect(dismissTopLayer()).toBe(true);
    await tick();

    expect(screen.queryByTestId('note-tool-menu')).toBeNull();
    expect(onToolChange).toHaveBeenCalledWith({ ...tool, type: 'quote' });
    // После закрытия слой снят: следующий Escape не трогает меню.
    expect(dismissTopLayer()).toBe(false);
  });

  it('не предлагает типы, недоступные формату', async () => {
    renderMenu({ allowedTypes: ['quote', 'text'] });
    await openMenu();

    expect(screen.getByRole('button', { name: 'Цитата' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Текст' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Фигура' })).toBeNull();
  });
});
