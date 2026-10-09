import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
    addQuote,
    addShapeNote,
    addTextNote,
    allowedNoteTypes,
    bookKey,
    changeNoteColor,
    createSet,
    deleteNote,
    deleteSet,
    DEFAULT_NOTE_COLOR,
    DEFAULT_NOTE_TOOL,
    DEFAULT_NOTE_TYPE,
    DEFAULT_SHAPE_KIND,
    FLOWING_NOTE_TYPES,
    getSet,
    listAllSets,
    listSets,
    loadSets,
    noteList,
    noteName,
    notePreview,
    normalizeColor,
    normalizeNote,
    normalizeNoteTool,
    normalizeSet,
    normalizeSetSummary,
    normalizeShapeKind,
    normalizeType,
    NOTE_COLORS,
    NOTE_COLOR_HIGHLIGHTS,
    NOTE_COLOR_SWATCHES,
    noteHighlights,
    noteMarkerColor,
    NOTE_TYPES,
    renameSet,
    resolveActiveSetId,
    setActiveSet,
    SHAPE_KINDS,
    updateNoteDetails,
} from './notes';
import { createAnchor, createPageAnchor, serializeAnchor } from '../reader/reader/anchor';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
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

    it('читает цвет заметки и подставляет цвет по умолчанию', () => {
        expect(normalizeNote({ id: 'n', color: 'green' }).color).toBe('green');
        expect(normalizeNote({ id: 'n' }).color).toBe(DEFAULT_NOTE_COLOR);
        expect(normalizeNote({ id: 'n', color: 'chartreuse' }).color).toBe(DEFAULT_NOTE_COLOR);
    });

    it('читает тип и вид фигуры и подставляет значения по умолчанию', () => {
        expect(normalizeNote({ id: 'n', type: 'text' }).type).toBe('text');
        expect(normalizeNote({ id: 'n', type: 'shape' }).type).toBe('shape');
        expect(normalizeNote({ id: 'n' }).type).toBe(DEFAULT_NOTE_TYPE);
        expect(normalizeNote({ id: 'n', type: 'sticker' }).type).toBe(DEFAULT_NOTE_TYPE);
        expect(normalizeNote({ id: 'n', shape: 'ellipse' }).shape).toBe('ellipse');
        expect(normalizeNote({ id: 'n' }).shape).toBe(DEFAULT_SHAPE_KIND);
        expect(normalizeNote({ id: 'n', shape: 'hexagon' }).shape).toBe(DEFAULT_SHAPE_KIND);
    });

    it('читает текст и геометрию заметки', () => {
        const note = normalizeNote({ id: 'n', text: 'мысль', geometry: 'g' });
        expect(note.text).toBe('мысль');
        expect(note.geometry).toBe('g');
        expect(normalizeNote({ id: 'n' }).text).toBe('');
        expect(normalizeNote({ id: 'n' }).geometry).toBe('');
    });

    it('читает название и комментарий, отсутствие даёт пустые строки', () => {
        const note = normalizeNote({ id: 'n', title: 'Идея', comment: 'Разобрать' });
        expect(note.title).toBe('Идея');
        expect(note.comment).toBe('Разобрать');
        expect(normalizeNote({ id: 'n' }).title).toBe('');
        expect(normalizeNote({ id: 'n' }).comment).toBe('');
    });

    it('normalizeColor знает палитру и отбрасывает чужие значения', () => {
        expect(NOTE_COLORS).toHaveLength(5);
        expect(NOTE_COLORS).not.toContain('black');
        expect(NOTE_COLORS).toContain('red');
        expect(normalizeColor('blue')).toBe('blue');
        expect(normalizeColor('black')).toBe(DEFAULT_NOTE_COLOR);
        expect(normalizeColor('  purple  ')).toBe('purple');
        expect(normalizeColor('')).toBe(DEFAULT_NOTE_COLOR);
        expect(normalizeColor(undefined)).toBe(DEFAULT_NOTE_COLOR);
    });

    it('normalizeType и normalizeShapeKind знают наборы и отбрасывают чужие значения', () => {
        expect(NOTE_TYPES).toHaveLength(3);
        expect(SHAPE_KINDS).toHaveLength(3);
        expect(normalizeType('text')).toBe('text');
        expect(normalizeType('')).toBe(DEFAULT_NOTE_TYPE);
        expect(normalizeType('sticker')).toBe(DEFAULT_NOTE_TYPE);
        expect(normalizeShapeKind('ellipse')).toBe('ellipse');
        expect(normalizeShapeKind('')).toBe(DEFAULT_SHAPE_KIND);
        expect(normalizeShapeKind('hexagon')).toBe(DEFAULT_SHAPE_KIND);
    });

    it('метка заметки берёт один мягкий тон по цвету', () => {
        // Вид заметки на странице и метка в списке совпадают: жёлтая заметка
        // светло-жёлтая и для цитаты, и для текста, и для фигуры, поэтому тип
        // на цвет метки не влияет.
        expect(noteMarkerColor({ color: 'yellow' })).toBe(NOTE_COLOR_HIGHLIGHTS.yellow);
        expect(noteMarkerColor({ color: 'purple' })).toBe(NOTE_COLOR_HIGHLIGHTS.purple);
        // Насыщенный акцент остаётся только у образцов выбора цвета.
        expect(NOTE_COLOR_SWATCHES.yellow).not.toBe(NOTE_COLOR_HIGHLIGHTS.yellow);
    });

    it('метка заметки следует стороне темы области чтения', () => {
        const dark = noteMarkerColor({ color: 'yellow' }, 'dark', 'gruvbox');
        const light = noteMarkerColor({ color: 'yellow' }, 'light', 'gruvbox');
        expect(dark).not.toBe(light);
        expect(light).toBe(NOTE_COLOR_HIGHLIGHTS.yellow);
        // Тёмная сторона задана и различима для всех цветов.
        const tones = noteHighlights('dark', 'gruvbox');
        for (const color of NOTE_COLORS) {
            expect(tones[color]).toBeTruthy();
            expect(tones[color]).not.toBe(NOTE_COLOR_HIGHLIGHTS[color]);
            expect(noteMarkerColor({ color }, 'dark', 'gruvbox')).toBe(tones[color]);
        }
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
    it('запрашивает список наборов книги', async () => {
        invoke.mockResolvedValue({ sets: [{ id: 'ns-1', name: 'Основные', note_count: 2 }] });
        const sets = await listSets('lib::book-1');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'list_sets',
            payload: { book_key: 'lib::book-1' },
        });
        expect(sets).toEqual([{ id: 'ns-1', bookKey: '', bookTitle: '', name: 'Основные', noteCount: 2 }]);
    });

    it('читает сохранённый активный набор книги', async () => {
        invoke.mockResolvedValue({
            sets: [{ id: 'ns-2', name: 'Черновик', note_count: 0 }],
            active_set_id: 'ns-2',
        });
        const result = await loadSets('lib::book-1');

        expect(result.sets).toHaveLength(1);
        expect(result.activeSetId).toBe('ns-2');
    });

    it('активный набор отсутствует, если хранилище его не вернуло', async () => {
        invoke.mockResolvedValue({ sets: [] });
        const result = await loadSets('lib::book-1');

        expect(result.activeSetId).toBeNull();
    });

    it('запоминает активный набор книги', async () => {
        invoke.mockResolvedValue({ ok: true });
        await setActiveSet('lib::book-1', 'ns-2');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'set_active',
            payload: { book_key: 'lib::book-1', set_id: 'ns-2' },
        });
    });

    it('добавляет заметку-цитату с якорем и цветом по умолчанию', async () => {
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
                    type: 'quote',
                    anchor: serializeAnchor(anchor),
                    quote: 'цитата',
                    chapter: '1',
                    color: 'yellow',
                    percent: 3.5,
                    page: null,
                    text: '',
                },
            },
        });
    });

    it('добавляет заметку-цитату с выбранным цветом', async () => {
        invoke.mockResolvedValue(setResponse());
        const set = normalizeSet((setResponse() as { set: unknown }).set);
        const anchor = createAnchor({ chapter: 1, start: 2, end: 8, quote: 'цитата' });
        await addQuote('lib::book-1', anchor, set, 'blue');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'add_note',
            payload: expect.objectContaining({
                note: expect.objectContaining({ color: 'blue' }),
            }),
        });
    });

    it('меняет цвет заметки', async () => {
        invoke.mockResolvedValue(setResponse());
        await changeNoteColor('lib::book-1', 'ns-1', 'note-1', 'purple');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'update_note',
            payload: {
                book_key: 'lib::book-1',
                set_id: 'ns-1',
                note_id: 'note-1',
                patch: { color: 'purple' },
            },
        });
    });

    it('добавляет текстовую карточку с якорем точки', async () => {
        invoke.mockResolvedValue(setResponse());
        const anchor = createAnchor({ kind: 'point', chapter: 1, x: 0.2, y: 0.3, percent: 4 });
        await addTextNote('lib::book-1', 'ns-1', anchor, 'мысль', 'purple');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'add_note',
            payload: expect.objectContaining({
                set_id: 'ns-1',
                note: expect.objectContaining({
                    type: 'text',
                    text: 'мысль',
                    color: 'purple',
                    anchor: serializeAnchor(anchor),
                }),
            }),
        });
    });

    it('добавляет фигуру с видом и геометрией', async () => {
        invoke.mockResolvedValue(setResponse());
        const anchor = createAnchor({ kind: 'point', chapter: 0, x: 0.1, y: 0.1 });
        await addShapeNote('lib::book-1', 'ns-1', anchor, 'ellipse', 'geometry', 'green');

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'add_note',
            payload: expect.objectContaining({
                note: expect.objectContaining({
                    type: 'shape',
                    shape: 'ellipse',
                    geometry: 'geometry',
                    color: 'green',
                }),
            }),
        });
    });

    it('изменяет название и комментарий заметки', async () => {
        invoke.mockResolvedValue(setResponse());
        await updateNoteDetails('lib::book-1', 'ns-1', 'note-1', {
            title: 'Идея',
            comment: 'Разобрать',
        });

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'update_note',
            payload: {
                book_key: 'lib::book-1',
                set_id: 'ns-1',
                note_id: 'note-1',
                patch: { title: 'Идея', comment: 'Разобрать' },
            },
        });
    });

    it('очищает комментарий явной пустой строкой и не трогает название', async () => {
        invoke.mockResolvedValue(setResponse());
        await updateNoteDetails('lib::book-1', 'ns-1', 'note-1', { comment: '' });

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'update_note',
            payload: {
                book_key: 'lib::book-1',
                set_id: 'ns-1',
                note_id: 'note-1',
                patch: { comment: '' },
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
            payload: { book_key: 'lib::book-1', book_title: '', name: 'Основные' },
        });

        const set = await getSet('ns-1');
        expect(set.notes[0].quote).toBe('цитата');
    });

    it('передаёт отображаемое имя книги при создании набора', async () => {
        invoke.mockResolvedValue(setResponse());
        await createSet('lib::book-1', 'Основные', 'Война и мир');
        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'create_set',
            payload: {
                book_key: 'lib::book-1',
                book_title: 'Война и мир',
                name: 'Основные',
            },
        });
    });

    it('читает агрегат наборов всех книг', async () => {
        invoke.mockResolvedValue({
            sets: [
                {
                    id: 'ns-1',
                    book_key: '/lib/a.epub',
                    book_title: 'Книга A',
                    name: 'Основные',
                    created_at_millis: 1,
                    notes: [],
                },
                {
                    id: 'ns-2',
                    book_key: '/lib/b.pdf',
                    name: 'B',
                    created_at_millis: 2,
                    notes: [{ id: 'n1', quote: 'ц' }],
                },
            ],
        });
        const sets = await listAllSets();

        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'list_all_sets',
            payload: {},
        });
        expect(sets).toHaveLength(2);
        expect(sets[0].bookTitle).toBe('Книга A');
        expect(sets[1].bookTitle).toBe('');
        expect(sets[1].notes[0].quote).toBe('ц');
    });

    it('переименовывает набор', async () => {
        invoke.mockResolvedValue(setResponse());
        await renameSet('ns-1', 'Конспект');
        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'rename_set',
            payload: { set_id: 'ns-1', name: 'Конспект' },
        });
    });

    it('удаляет набор', async () => {
        invoke.mockResolvedValue({ ok: true });
        await deleteSet('ns-1');
        expect(invoke).toHaveBeenCalledWith('invoke_base_plugin_operation', {
            capability: 'notes.store@1',
            operation: 'delete_set',
            payload: { set_id: 'ns-1' },
        });
    });
});

describe('выбор активного набора', () => {
    const summary = (id: string): ReturnType<typeof normalizeSetSummary> =>
        normalizeSetSummary({ id, name: id, note_count: 0 });

    it('сохраняет предпочтительный набор, если он принадлежит книге', () => {
        expect(resolveActiveSetId([summary('a'), summary('b')], 'b')).toBe('b');
    });

    it('берёт первый набор, если предпочтительный исчез', () => {
        expect(resolveActiveSetId([summary('a'), summary('b')], 'gone')).toBe('a');
    });

    it('без наборов активного набора нет', () => {
        expect(resolveActiveSetId([], null)).toBeNull();
    });
});

describe('имя и место заметки', () => {
    it('берёт имя из цитаты и обрезает длинную', () => {
        const note = normalizeNote({ id: '1', quote: 'Короткая цитата' });
        expect(noteName(note, 0)).toBe('Короткая цитата');
        expect(noteName(normalizeNote({ id: '2' }), 2)).toBe('Заметка 3');
    });

    it('ставит пользовательское название впереди содержимого', () => {
        const note = normalizeNote({ id: '1', quote: 'Длинная цитата', title: 'Тезис' });
        expect(noteName(note, 0)).toBe('Тезис');
        // Название обрезается по той же длине, что и содержимое.
        expect(noteName(normalizeNote({ id: '2', title: 'x'.repeat(100) }), 0)).toHaveLength(81);
    });

    it('берёт имя текстовой карточки из её текста', () => {
        const note = normalizeNote({ id: '1', type: 'text', text: 'моя мысль' });
        expect(noteName(note, 0)).toBe('моя мысль');
        expect(noteName(normalizeNote({ id: '2', type: 'text' }), 1)).toBe('Заметка 2');
    });

    it('берёт имя фигуры из её вида', () => {
        expect(noteName(normalizeNote({ id: '1', type: 'shape', shape: 'ellipse' }), 0)).toBe(
            'Эллипс',
        );
        expect(noteName(normalizeNote({ id: '2', type: 'shape' }), 1)).toBe('Линия');
    });

    it('показывает страницу либо долю позиции', () => {
        expect(noteList([normalizeNote({ id: '1', page: 7 })])[0].place).toBe('Стр. 7');
        expect(noteList([normalizeNote({ id: '1', percent: 12.3456 })])[0].place).toBe('12.35 %');
        expect(noteList([normalizeNote({ id: '1' })])[0].place).toBe('');
    });

    it('выводит начало содержимого отдельно от имени', () => {
        expect(notePreview(normalizeNote({ id: '1', quote: 'Начало цитаты' }))).toBe(
            'Начало цитаты',
        );
        expect(notePreview(normalizeNote({ id: '1', type: 'text', text: 'мысль' }))).toBe('мысль');
        // У фигуры содержимого нет: вид показывает имя, превью пустое.
        expect(notePreview(normalizeNote({ id: '1', type: 'shape', shape: 'ellipse' }))).toBe('');
        // Длинное содержимое обрезается.
        expect(notePreview(normalizeNote({ id: '1', quote: 'x'.repeat(200) }))).toHaveLength(121);
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

describe('доступные типы заметок по режиму чтения', () => {
    it('в текучем режиме доступна только цитата', () => {
        expect(allowedNoteTypes(false)).toEqual(FLOWING_NOTE_TYPES);
        expect(allowedNoteTypes(false)).toEqual(['quote']);
    });

    it('в страничном режиме доступны все типы', () => {
        expect(allowedNoteTypes(true)).toEqual(NOTE_TYPES);
    });

    it('приводит недоступный инструмент к цитате, сохраняя цвет', () => {
        const tool = {
            ...DEFAULT_NOTE_TOOL,
            type: 'shape' as const,
            shape: 'ellipse' as const,
            color: 'blue' as const,
        };
        expect(normalizeNoteTool(tool, FLOWING_NOTE_TYPES)).toEqual({
            ...tool,
            type: 'quote',
        });
        // Доступный инструмент не меняется.
        expect(normalizeNoteTool(tool, NOTE_TYPES)).toEqual(tool);
    });
});
