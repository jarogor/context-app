import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    addQuote,
    bookKey,
    createSet,
    deleteNote,
    DEFAULT_SET_NAME,
    ensureDefaultSet,
    filterNotes,
    findSet,
    getSet,
    listSets,
    noteList,
    noteName,
    normalizeNote,
    normalizeSet,
    normalizeSetSummary,
} from './notes';
import { createAnchor, createPageAnchor, serializeAnchor } from './reader/anchor';
import { invokeCommand } from './app-bridge';

vi.mock('./app-bridge', () => ({
    invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

/** Ответ плагина с одним набором и одной заметкой-цитатой. */
function setResponse(): unknown {
    return {
        sets: [
            {
                id: 'ns-1',
                book_key: 'lib::book-1',
                name: 'Основные',
                created_at_millis: 10,
                notes: [],
            },
        ],
        set: {
            id: 'ns-1',
            book_key: 'lib::book-1',
            name: 'Основные',
            created_at_millis: 10,
            notes: [
                {
                    id: 'note-1',
                    anchor: '{"v":1,"chapter":0,"start":0,"end":6}',
                    quote: 'цитата',
                    chapter: '0',
                    percent: 12.5,
                    page: 42,
                    created_at_millis: 20,
                    updated_at_millis: 30,
                },
            ],
        },
    };
}

beforeEach(() => {
    invoke.mockReset();
});

describe('ключ книги', () => {
    it('строится по пути к файлу книги', () => {
        expect(bookKey('/lib/a/book.epub')).toBe('/lib/a/book.epub');
    });

    it('подставляет заглушку без пути', () => {
        expect(bookKey(null)).toBe('no-library');
        expect(bookKey('  ')).toBe('no-library');
    });
});

describe('нормализация', () => {
    it('читает заметку-цитату с полями ядра', () => {
        const note = normalizeNote({
            id: 'n',
            quote: 'цитата',
            percent: 5,
            page: 12,
            created_at_millis: 1,
            updated_at_millis: 2,
        });
        expect(note.quote).toBe('цитата');
        expect(note.percent).toBe(5);
        expect(note.page).toBe(12);
        expect(note.createdAtMillis).toBe(1);
    });

    it('приводит отсутствующие место и страницу к null', () => {
        expect(normalizeNote({ id: 'n' }).percent).toBeNull();
        expect(normalizeNote({ id: 'n' }).page).toBeNull();
        expect(normalizeNote({ id: 'n', percent: null }).percent).toBeNull();
    });

    it('читает набор с заметками', () => {
        const set = normalizeSet((setResponse() as { set: unknown }).set);
        expect(set.id).toBe('ns-1');
        expect(set.bookKey).toBe('lib::book-1');
        expect(set.notes).toHaveLength(1);
        expect(set.notes[0].quote).toBe('цитата');
    });

    it('читает краткое описание набора', () => {
        const summary = normalizeSetSummary({ id: 'ns-1', name: 'Набор', note_count: 3 });
        expect(summary.noteCount).toBe(3);
        expect(summary.name).toBe('Набор');
    });
});

describe('операции плагина заметок', () => {
    it('запрашивает наборы книги и первый набор', async () => {
        invoke.mockResolvedValue({ sets: [{ id: 'ns-1', name: 'Основные', note_count: 2 }] });
        const sets = await listSets('lib::book-1');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'list_sets',
            payload: { book_key: 'lib::book-1' },
        });
        expect(sets).toEqual([{ id: 'ns-1', bookKey: '', name: 'Основные', noteCount: 2 }]);

        invoke.mockResolvedValue(setResponse());
        const set = await findSet('lib::book-1');
        expect(set?.id).toBe('ns-1');
    });

    it('первый набор отсутствует', async () => {
        invoke.mockResolvedValue({ sets: [] });
        expect(await findSet('lib::book-1')).toBeNull();
    });

    it('заводит набор по умолчанию, если наборов нет', async () => {
        invoke.mockResolvedValueOnce({ sets: [] }).mockResolvedValueOnce(setResponse());
        const set = await ensureDefaultSet('lib::book-1');

        expect(invoke).toHaveBeenNthCalledWith(1, 'invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'list_sets',
            payload: { book_key: 'lib::book-1' },
        });
        expect(invoke).toHaveBeenNthCalledWith(2, 'invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'create_set',
            payload: { book_key: 'lib::book-1', name: DEFAULT_SET_NAME },
        });
        expect(set.id).toBe('ns-1');
    });

    it('берёт существующий набор по умолчанию', async () => {
        invoke
            .mockResolvedValueOnce({ sets: [{ id: 'ns-9', name: 'Основные', note_count: 0 }] })
            .mockResolvedValueOnce(setResponse());
        const set = await ensureDefaultSet('lib::book-1');

        expect(invoke).toHaveBeenNthCalledWith(2, 'invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'get_set',
            payload: { set_id: 'ns-9' },
        });
        expect(set.id).toBe('ns-1');
    });

    it('добавляет заметку-цитату с якорем', async () => {
        invoke.mockResolvedValue(setResponse());
        const set = normalizeSet((setResponse() as { set: unknown }).set);
        const anchor = createAnchor({
            chapter: 1,
            start: 2,
            end: 8,
            quote: 'цитата',
            percent: 3.5,
        });
        await addQuote('lib::book-1', anchor, set);

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'add_note',
            payload: {
                book_key: 'lib::book-1',
                set_id: 'ns-1',
                note: {
                    anchor: serializeAnchor(anchor),
                    quote: 'цитата',
                    chapter: '1',
                    percent: 3.5,
                    page: null,
                    text: '',
                },
            },
        });
    });

    it('удаляет заметку из набора', async () => {
        invoke.mockResolvedValue(setResponse());
        await deleteNote('lib::book-1', 'ns-1', 'note-1');
        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'delete_note',
            payload: { book_key: 'lib::book-1', set_id: 'ns-1', note_id: 'note-1' },
        });
    });

    it('читает набор целиком', async () => {
        invoke.mockResolvedValue(setResponse());
        await createSet('lib::book-1', 'Основные');
        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'create_set',
            payload: { book_key: 'lib::book-1', name: 'Основные' },
        });

        const set = await getSet('ns-1');
        expect(set.notes[0].quote).toBe('цитата');
    });
});

describe('имя и место заметки', () => {
    it('берёт имя из цитаты и обрезает длинную', () => {
        const note = normalizeNote({ id: '1', quote: 'Короткая цитата' });
        expect(noteName(note, 0)).toBe('Короткая цитата');
        expect(noteName(normalizeNote({ id: '2' }), 2)).toBe('Заметка 3');
    });

    it('показывает страницу либо долю позиции', () => {
        expect(noteList([normalizeNote({ id: '1', page: 7 })])[0].place).toBe('Стр. 7');
        expect(noteList([normalizeNote({ id: '1', percent: 12.3456 })])[0].place).toBe('12.35 %');
        expect(noteList([normalizeNote({ id: '1' })])[0].place).toBe('');
    });
});

describe('порядок заметок', () => {
    it('сортирует по расположению в книге, а не по времени добавления', () => {
        // Вторая по времени заметка стоит выше по тексту — она должна быть первой.
        const later = normalizeNote({
            id: 'late',
            createdAtMillis: 200,
            anchor: serializeAnchor(createAnchor({ chapter: 0, start: 10, end: 20, quote: 'б' })),
        });
        const earlier = normalizeNote({
            id: 'early',
            createdAtMillis: 100,
            anchor: serializeAnchor(createAnchor({ chapter: 0, start: 5, end: 9, quote: 'а' })),
        });

        expect(noteList([later, earlier]).map((item) => item.note.id)).toEqual(['early', 'late']);
    });

    it('сравнивает заметки из разных глав по номеру главы', () => {
        const second = normalizeNote({
            id: 'ch2',
            anchor: serializeAnchor(createAnchor({ chapter: 2, start: 0, end: 4, quote: 'б' })),
        });
        const first = normalizeNote({
            id: 'ch1',
            anchor: serializeAnchor(createAnchor({ chapter: 1, start: 0, end: 4, quote: 'а' })),
        });

        expect(noteList([second, first]).map((item) => item.note.id)).toEqual(['ch1', 'ch2']);
    });

    it('без якоря опирается на страницу и долю позиции', () => {
        const page = normalizeNote({ id: 'page', page: 3, createdAtMillis: 300 });
        const percent = normalizeNote({ id: 'percent', percent: 1.5, createdAtMillis: 100 });
        const missing = normalizeNote({ id: 'missing', createdAtMillis: 50 });

        expect(noteList([missing, page, percent]).map((item) => item.note.id)).toEqual([
            'percent',
            'page',
            'missing',
        ]);
    });

    it('сортирует страничные заметки по номеру страницы', () => {
        const later = normalizeNote({
            id: 'p9',
            page: 9,
            createdAtMillis: 100,
            anchor: serializeAnchor(createPageAnchor({ page: 9, quote: 'б', percent: 90 })),
        });
        const earlier = normalizeNote({
            id: 'p3',
            page: 3,
            createdAtMillis: 200,
            anchor: serializeAnchor(createPageAnchor({ page: 3, quote: 'а', percent: 30 })),
        });

        expect(noteList([later, earlier]).map((item) => item.note.id)).toEqual(['p3', 'p9']);
    });
});

describe('поиск по заметкам', () => {
    const notes = [
        normalizeNote({ id: '1', quote: 'Хайдеггер', chapter: 'Введение' }),
        normalizeNote({ id: '2', quote: 'Деррида' }),
        normalizeNote({ id: '3', quote: 'Карнап' }),
    ];

    it('пустой запрос возвращает все заметки', () => {
        expect(filterNotes(notes, '   ')).toHaveLength(3);
    });

    it('ищет по цитате и метке места', () => {
        expect(filterNotes(notes, 'деррида').map((note) => note.id)).toEqual(['2']);
        expect(filterNotes(notes, 'введение').map((note) => note.id)).toEqual(['1']);
    });

    it('без совпадений возвращает пустой список', () => {
        expect(filterNotes(notes, 'нетттакого')).toHaveLength(0);
    });
});
