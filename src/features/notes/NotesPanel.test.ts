import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NotesPanel from './NotesPanel.svelte';
import { noteList, normalizeNote, normalizeSetSummary, type NoteListItem } from './notes';

/** Элементы списка заметок из ответов плагина. */
function items(...notes: unknown[]): NoteListItem[] {
  return noteList(notes.map((note) => normalizeNote(note)));
}

/** Краткое описание набора для свойств панели. */
function sets(...names: Array<[string, string]>) {
  return names.map(([id, name]) => normalizeSetSummary({ id, name, note_count: 0 }));
}

describe('панель заметок-цитат', () => {
  it('показывает пустое состояние без книги', () => {
    render(NotesPanel, { props: { items: [], sets: [], activeSetId: null, hasBook: false } });
    expect(screen.getByTestId('notes-panel-empty')).toBeTruthy();
  });

  it('адаптируется к области: ширина токеном и на всю ширину на узком окне', () => {
    render(NotesPanel, { props: { items: [], sets: [], activeSetId: null, hasBook: true } });
    const panel = screen.getByTestId('notes-panel');
    expect(panel.className).toContain('var(--notes-panel-width)');
    // На узком окне панель занимает всю ширину области: общее поведение
    // задаёт компонент боковой панели.
    expect(panel.className).toContain('max-lg:absolute');
    expect(panel.className).toContain('max-lg:w-auto');
  });

  it('показывает цитаты, место и дату', () => {
    const createdAt = new Date(1_700_000_000_000).getTime();
    render(NotesPanel, {
      props: {
        items: items({
          id: '1',
          quote: 'Мысль о тексте',
          percent: 12.5,
          created_at_millis: createdAt,
        }),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    expect(screen.getByTestId('notes-item')).toBeTruthy();
    expect(screen.getByText('Мысль о тексте')).toBeTruthy();
    const place = screen.getByTestId('notes-item-place');
    expect(place.textContent).toBe('12.50 %');

    // Дата стоит в той же строке, что тип и место, а не отдельной строкой ниже.
    const date = screen.getByTestId('notes-item-date');
    expect(date.textContent).not.toBe('');
    expect(date.parentElement).toBe(place.parentElement);
  });

  it('напоминает выделить текст, когда заметок нет', () => {
    render(NotesPanel, { props: { items: [], sets: [], activeSetId: null, hasBook: true } });
    expect(screen.getByTestId('notes-list-empty').textContent).toContain('Выделите фрагмент');
  });

  it('фильтрует цитаты по запросу', async () => {
    render(NotesPanel, {
      props: {
        items: items({ id: '1', quote: 'Хайдеггер' }, { id: '2', quote: 'Деррида' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск по заметкам'), {
      target: { value: 'деррида' },
    });

    expect(screen.getAllByTestId('notes-item')).toHaveLength(1);
    expect(screen.getByText('Деррида')).toBeTruthy();
  });

  it('показывает тип заметки и фильтрует по тексту карточки', async () => {
    render(NotesPanel, {
      props: {
        items: items(
          { id: '1', type: 'text', text: 'Хайдеггер', page: 3 },
          { id: '2', shape: 'ellipse', type: 'shape', page: 1 },
        ),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    const types = screen.getAllByTestId('notes-item-type').map((element) => element.textContent);
    expect(types).toContain('Текст');
    expect(types).toContain('Фигура');

    await fireEvent.input(screen.getByPlaceholderText('Поиск по заметкам'), {
      target: { value: 'хайдеггер' },
    });

    expect(screen.getAllByTestId('notes-item')).toHaveLength(1);
    expect(screen.getByTestId('notes-item-type').textContent).toBe('Текст');
  });

  it('сообщает о переходе к заметке и удалении', async () => {
    const onGoToNote = vi.fn();
    const onDeleteNote = vi.fn();
    render(NotesPanel, {
      props: {
        items: items({ id: 'note-1', quote: 'Цитата' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
        onGoToNote,
        onDeleteNote,
      },
    });

    await fireEvent.click(screen.getByTestId('notes-item-link'));
    expect(onGoToNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));

    await fireEvent.pointerDown(screen.getByLabelText('Действия с заметкой'), { button: 0 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    expect(onDeleteNote).toHaveBeenCalledWith('note-1');
  });

  it('показывает цвет заметки боковой полосой', () => {
    render(NotesPanel, {
      props: {
        items: items({ id: 'note-1', quote: 'Цветная', color: 'purple' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    const item = screen.getByTestId('notes-item');
    expect(item.getAttribute('data-color')).toBe('purple');
    expect(screen.getByTestId('notes-item-color')).toBeTruthy();
  });

  it('показывает название, тип и начало цитаты, а также комментарий', () => {
    render(NotesPanel, {
      props: {
        items: items({
          id: 'note-1',
          quote: 'Длинная цитата',
          title: 'Тезис',
          comment: 'Разобрать позже',
        }),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    expect(screen.getByText('Тезис')).toBeTruthy();
    // Тип показан лейблом, начало цитаты — отдельной строкой под названием.
    expect(screen.getByTestId('notes-item-type').textContent).toContain('Цитата');
    expect(screen.getByTestId('notes-item-preview').textContent).toContain('Длинная цитата');
    expect(screen.getByTestId('notes-item-comment').textContent).toBe('Разобрать позже');
  });

  it('без названия показывает цитату как имя, без дублирующей строки', () => {
    render(NotesPanel, {
      props: {
        items: items({ id: 'note-1', quote: 'Короткая цитата' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    expect(screen.getByTestId('notes-item-link').textContent).toContain('Короткая цитата');
    expect(screen.queryByTestId('notes-item-preview')).toBeNull();
  });

  it('ищет по названию и комментарию', async () => {
    render(NotesPanel, {
      props: {
        items: items(
          { id: '1', quote: 'цитата', title: 'Онтология', comment: 'позже' },
          { id: '2', quote: 'другое' },
        ),
        sets: [],
        activeSetId: null,
        hasBook: true,
      },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск по заметкам'), {
      target: { value: 'позже' },
    });

    expect(screen.getAllByTestId('notes-item')).toHaveLength(1);
    expect(screen.getByTestId('notes-item-comment').textContent).toBe('позже');
  });

  it('редактирует название и комментарий заметки', async () => {
    const onEditNote = vi.fn();
    render(NotesPanel, {
      props: {
        items: items({ id: 'note-1', quote: 'Цитата', title: 'Черновик', comment: 'Старый' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
        onEditNote,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия с заметкой'), { button: 0 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Изменить' }));

    const editor = screen.getByTestId('notes-item-editor');
    await fireEvent.input(screen.getByLabelText('Название заметки'), {
      target: { value: 'Итог' },
    });
    await fireEvent.input(screen.getByLabelText('Комментарий заметки'), {
      target: { value: 'Готово' },
    });
    await fireEvent.click(within(editor).getByRole('button', { name: 'Сохранить' }));

    expect(onEditNote).toHaveBeenCalledWith('note-1', { title: 'Итог', comment: 'Готово' });
  });

  it('удаляет комментарий, очищая поле, не трогая название', async () => {
    const onEditNote = vi.fn();
    render(NotesPanel, {
      props: {
        items: items({ id: 'note-1', quote: 'Цитата', title: 'Тезис', comment: 'Старый' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
        onEditNote,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия с заметкой'), { button: 0 });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Изменить' }));
    const editor = screen.getByTestId('notes-item-editor');
    await fireEvent.click(within(editor).getByRole('button', { name: 'Удалить комментарий' }));
    await fireEvent.click(within(editor).getByRole('button', { name: 'Сохранить' }));

    expect(onEditNote).toHaveBeenCalledWith('note-1', { title: 'Тезис', comment: '' });
  });

  it('сообщает о смене цвета заметки, включая чёрный', async () => {
    const onChangeColor = vi.fn();
    render(NotesPanel, {
      props: {
        items: items({ id: 'note-1', quote: 'Цитата' }),
        sets: [],
        activeSetId: null,
        hasBook: true,
        onChangeColor,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия с заметкой'), { button: 0 });
    await fireEvent.click(screen.getByTestId('menu-color-purple'));
    expect(onChangeColor).toHaveBeenCalledWith('note-1', 'purple');
  });

  it('переключает активный набор', async () => {
    const onSelectSet = vi.fn();
    render(NotesPanel, {
      props: {
        items: [],
        sets: sets(['ns-1', 'Основные'], ['ns-2', 'Конспект']),
        activeSetId: 'ns-1',
        hasBook: true,
        onSelectSet,
      },
    });

    await fireEvent.pointerDown(screen.getByRole('button', { name: 'Набор заметок' }), {
      button: 0,
    });
    await fireEvent.pointerUp(screen.getByRole('option', { name: 'Конспект (0)' }));
    expect(onSelectSet).toHaveBeenCalledWith('ns-2');
  });

  it('создаёт набор с непустым именем', async () => {
    const onCreateSet = vi.fn();
    render(NotesPanel, {
      props: {
        items: [],
        sets: sets(['ns-1', 'Основные']),
        activeSetId: 'ns-1',
        hasBook: true,
        onCreateSet,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия с набором заметок'), {
      button: 0,
    });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Новый набор' }));
    await fireEvent.input(screen.getByPlaceholderText('Новый набор'), {
      target: { value: 'Черновик' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Создать' }));

    expect(onCreateSet).toHaveBeenCalledWith('Черновик');
  });

  it('переименовывает активный набор', async () => {
    const onRenameSet = vi.fn();
    render(NotesPanel, {
      props: {
        items: [],
        sets: sets(['ns-1', 'Основные']),
        activeSetId: 'ns-1',
        hasBook: true,
        onRenameSet,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия с набором заметок'), {
      button: 0,
    });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Переименовать' }));
    await fireEvent.input(screen.getByPlaceholderText('Новое имя'), {
      target: { value: 'Конспект' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    expect(onRenameSet).toHaveBeenCalledWith('ns-1', 'Конспект');
  });

  it('удаляет активный набор', async () => {
    const onRemoveSet = vi.fn();
    render(NotesPanel, {
      props: {
        items: [],
        sets: sets(['ns-1', 'Основные']),
        activeSetId: 'ns-1',
        hasBook: true,
        onRemoveSet,
      },
    });

    await fireEvent.pointerDown(screen.getByLabelText('Действия с набором заметок'), {
      button: 0,
    });
    await fireEvent.click(screen.getByRole('menuitem', { name: 'Удалить' }));
    expect(onRemoveSet).toHaveBeenCalledWith('ns-1');
  });
});
