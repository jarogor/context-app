import { describe, expect, it } from 'vitest';
import {
    createAnchor,
    createPageAnchor,
    isPageAnchor,
    offsetsFromRange,
    parseAnchor,
    rangeFromOffsets,
    serializeAnchor,
} from './anchor';

/** Корневой элемент главы с абзацами. */
function chapterRoot(html: string): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = html;
    return root;
}

describe('якорь выделения', () => {
    it('заполняет значения по умолчанию', () => {
        const anchor = createAnchor({});
        expect(anchor.v).toBe(1);
        expect(anchor.chapter).toBe(0);
        expect(anchor.start).toBe(0);
        expect(anchor.end).toBe(0);
        expect(anchor.quote).toBe('');
        expect(anchor.percent).toBe(0);
        expect(anchor.page).toBeNull();
    });

    it('переживает круговой обход', () => {
        const anchor = createAnchor({
            chapter: 2,
            start: 4,
            end: 9,
            quote: 'цитата',
            percent: 12.3456,
        });
        const restored = parseAnchor(serializeAnchor(anchor));
        expect(restored).toEqual(anchor);
    });

    it('повреждённая строка даёт null', () => {
        expect(parseAnchor('не json')).toBeNull();
        expect(parseAnchor('')).toBeNull();
        expect(parseAnchor(null)).toBeNull();
        expect(parseAnchor('{"start":1}')).toBeNull();
    });
});

describe('смещения выделения', () => {
    it('считает смещения в символах по всей главе', () => {
        const root = chapterRoot('<p>Привет</p><p>мир</p>');
        const first = root.querySelector('p')!.firstChild!;
        const second = root.querySelectorAll('p')[1].firstChild!;
        const range = document.createRange();
        range.setStart(first, 3);
        range.setEnd(second, 2);

        const offsets = offsetsFromRange(root, range);
        // «Привет» (6) + «мир» до 2 = 8; начало = 3.
        expect(offsets).toEqual({ start: 3, end: 8 });
    });

    it('возвращает диапазон по смещениям', () => {
        const root = chapterRoot('<p>Привет</p><p>мир</p>');
        const range = rangeFromOffsets(root, 3, 8);

        expect(range).not.toBeNull();
        expect(range!.toString()).toBe('ветми');
    });

    it('пустое выделение отклоняется', () => {
        const root = chapterRoot('<p>Привет</p>');
        const text = root.querySelector('p')!.firstChild!;
        const range = document.createRange();
        range.setStart(text, 3);
        range.setEnd(text, 3);
        expect(offsetsFromRange(root, range)).toBeNull();
    });

    it('смещения вне главы отклоняются', () => {
        const root = chapterRoot('<p>Привет</p>');
        expect(rangeFromOffsets(root, 10, 20)).toBeNull();
    });
});

describe('страничный якорь', () => {
    it('создаётся по странице и прямоугольникам', () => {
        const anchor = createPageAnchor({
            page: 5,
            quote: 'цитата на странице',
            percent: 42,
            rects: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.05 }],
        });
        expect(anchor.kind).toBe('page');
        expect(anchor.page).toBe(5);
        expect(anchor.chapter).toBe(0);
        expect(anchor.start).toBe(0);
        expect(isPageAnchor(anchor)).toBe(true);
        expect(anchor.rects).toHaveLength(1);
    });

    it('переживает круговой обход', () => {
        const anchor = createPageAnchor({
            page: 3,
            quote: 'текст',
            percent: 30,
            rects: [
                { x: 0.1, y: 0.1, width: 0.2, height: 0.04 },
                { x: 0.1, y: 0.2, width: 0.5, height: 0.04 },
            ],
        });
        expect(parseAnchor(serializeAnchor(anchor))).toEqual(anchor);
    });

    it('некорректные прямоугольники отбрасываются', () => {
        const anchor = createPageAnchor({
            page: 1,
            rects: [
                { x: 0.1, y: 0.1, width: 0.2, height: 0.04 },
                { x: 'нет', y: 0, width: 1, height: 1 } as never,
            ],
        });
        expect(anchor.rects).toHaveLength(1);
    });

    it('старый текстовый якорь без вида читается как текстовый', () => {
        const restored = parseAnchor('{"chapter":2,"start":4,"end":9,"quote":"ц"}');
        expect(restored?.kind).toBe('text');
        expect(restored?.chapter).toBe(2);
        expect(restored?.rects).toBeUndefined();
    });
});
