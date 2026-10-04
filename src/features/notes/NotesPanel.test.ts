import { fireEvent, render, screen } from '@testing-library/svelte';
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

    it('показывает цитаты, место и дату', () => {
        render(NotesPanel, {
            props: {
                items: items({
                    id: '1',
                    quote: 'Мысль о тексте',
                    percent: 12.5,
                    created_at_millis: 1,
                }),
                sets: [],
                activeSetId: null,
                hasBook: true,
            },
        });

        expect(screen.getByTestId('notes-item')).toBeTruthy();
        expect(screen.getByText('Мысль о тексте')).toBeTruthy();
        expect(screen.getByTestId('notes-item-place').textContent).toBe('12.50 %');
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

    it('сообщает о смене цвета заметки', async () => {
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
        await fireEvent.click(screen.getByTestId('menu-color-green'));
        expect(onChangeColor).toHaveBeenCalledWith('note-1', 'green');
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
