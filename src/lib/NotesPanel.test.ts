import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import NotesPanel from './NotesPanel.svelte';
import { noteList, normalizeNote, type NoteListItem } from './notes';

/** Элементы списка заметок из ответов плагина. */
function items(...notes: unknown[]): NoteListItem[] {
    return noteList(notes.map((note) => normalizeNote(note)));
}

describe('панель заметок-цитат', () => {
    it('показывает пустое состояние без книги', () => {
        render(NotesPanel, { props: { items: [], hasBook: false } });
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
                hasBook: true,
            },
        });

        expect(screen.getByTestId('notes-item')).toBeTruthy();
        expect(screen.getByText('Мысль о тексте')).toBeTruthy();
        expect(screen.getByTestId('notes-item-place').textContent).toBe('12.50 %');
    });

    it('напоминает выделить текст, когда заметок нет', () => {
        render(NotesPanel, { props: { items: [], hasBook: true } });
        expect(screen.getByTestId('notes-list-empty').textContent).toContain('Выделите фрагмент');
    });

    it('фильтрует цитаты по запросу', async () => {
        render(NotesPanel, {
            props: {
                items: items({ id: '1', quote: 'Хайдеггер' }, { id: '2', quote: 'Деррида' }),
                hasBook: true,
            },
        });

        await fireEvent.input(screen.getByPlaceholderText('Поиск по цитатам'), {
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
                hasBook: true,
                onGoToNote,
                onDeleteNote,
            },
        });

        await fireEvent.click(screen.getByTestId('notes-item-link'));
        expect(onGoToNote).toHaveBeenCalledWith(expect.objectContaining({ id: 'note-1' }));

        await fireEvent.click(screen.getByTitle('Удалить заметку'));
        expect(onDeleteNote).toHaveBeenCalledWith('note-1');
    });
});
