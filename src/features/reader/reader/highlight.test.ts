import { afterEach, describe, expect, it } from 'vitest';
import { clearNoteMarks, highlightTextRange } from './highlight';

/** Восстановители моков, снятые после каждого теста. */
const mocks: Array<() => void> = [];

/** Мок `Element.getClientRects`: рамка глифов заданной высоты.
 *
 * В jsdom метода нет (точнее, он всегда пуст), поэтому свойство задаётся напрямую.
 */
function mockGlyphRect(height: number): void {
    const original = Object.getOwnPropertyDescriptor(Element.prototype, 'getClientRects');
    Object.defineProperty(Element.prototype, 'getClientRects', {
        configurable: true,
        writable: true,
        value: () =>
            [
                {
                    top: 0,
                    bottom: height,
                    height,
                    left: 0,
                    right: 100,
                    width: 100,
                    x: 0,
                    y: 0,
                    toJSON: () => ({}),
                },
            ] as unknown as DOMRectList,
    });
    mocks.push(() => {
        if (original) {
            Object.defineProperty(Element.prototype, 'getClientRects', original);
        } else {
            delete (Element.prototype as unknown as { getClientRects?: unknown }).getClientRects;
        }
    });
}

afterEach(() => {
    mocks.splice(0).forEach((restore) => restore());
});

/** Корневой элемент главы. */
function root(html: string): HTMLElement {
    const element = document.createElement('div');
    element.innerHTML = html;
    return element;
}

describe('подсветка диапазона текста', () => {
    it('подсвечивает диапазон поверх вложенной разметки', () => {
        const chapter = root('<p>Слово <em>выделенное</em> и ещё <strong>жирное</strong> слово.</p>');

        // Диапазон начинается в тексте до <em> и заканчивается в тексте после </p>.
        const applied = highlightTextRange(chapter, 6, 44, 'texture-note', 'n1');

        expect(applied).toBe(true);
        const marks = chapter.querySelectorAll('mark.texture-note');
        expect(marks.length).toBeGreaterThan(1);
        expect(chapter.textContent).toBe('Слово выделенное и ещё жирное слово.');
        expect(Array.from(marks).map((mark) => mark.textContent).join('')).toBe(
            'выделенное и ещё жирное слово.',
        );
    });

    it('подсвечивает весь абзац с разметкой', () => {
        const chapter = root('<p>Начало <b>середина</b> конец.</p>');
        const paragraph = chapter.querySelector('p')!;

        const applied = highlightTextRange(paragraph, 0, paragraph.textContent!.length, 'note', 'n2');

        expect(applied).toBe(true);
        expect(chapter.querySelectorAll('mark.note').length).toBeGreaterThan(1);
        expect(chapter.textContent).toBe('Начало середина конец.');
    });

    it('снимает подсветку, возвращая исходный текст', () => {
        const chapter = root('<p>Слово <em>выделенное</em> слово.</p>');
        highlightTextRange(chapter, 6, 22, 'texture-note', 'n3');
        expect(chapter.querySelectorAll('mark.texture-note').length).toBeGreaterThan(0);

        clearNoteMarks(chapter, 'mark.texture-note');

        expect(chapter.querySelectorAll('mark.texture-note').length).toBe(0);
        expect(chapter.innerHTML).toBe('<p>Слово <em>выделенное</em> слово.</p>');
    });

    it('пустой диапазон не подсвечивается', () => {
        const chapter = root('<p>Текст</p>');
        expect(highlightTextRange(chapter, 2, 2, 'note', 'n4')).toBe(false);
        expect(chapter.querySelectorAll('mark').length).toBe(0);
    });

    it('наносит цвет заметки на подсветку', () => {
        const chapter = root('<p>Цветной текст.</p>');
        highlightTextRange(chapter, 0, 6, 'texture-note', 'n5', 'purple');

        const marks = chapter.querySelectorAll('mark.texture-note');
        expect(marks.length).toBeGreaterThan(0);
        for (const mark of Array.from(marks)) {
            expect((mark as HTMLElement).dataset.color).toBe('purple');
        }
    });

    it('без цвета использует цвет по умолчанию', () => {
        const chapter = root('<p>Текст.</p>');
        highlightTextRange(chapter, 0, 5, 'texture-note', 'n6');
        expect((chapter.querySelector('mark') as HTMLElement).dataset.color).toBe('yellow');
    });

    it('расширяет фон подсветки до высоты строки', () => {
        mockGlyphRect(10);
        const chapter = root('<p style="line-height:20px;font-size:10px">Текст.</p>');
        highlightTextRange(chapter, 0, 5, 'texture-note', 'n7');

        // Полулидинг = (20 − 10) / 2 = 5px плюс перекрытие соседних кусков
        // 0.25px — итого 5.25px = 0.525em при кегле 10px.
        const mark = chapter.querySelector('mark') as HTMLElement;
        expect(mark.style.paddingTop).toBe('0.525em');
        expect(mark.style.paddingBottom).toBe('0.525em');
    });

    it('не трогает подсветку, если строка не выше глифов', () => {
        mockGlyphRect(20);
        const chapter = root('<p style="line-height:20px;font-size:10px">Текст.</p>');
        highlightTextRange(chapter, 0, 5, 'texture-note', 'n8');

        const mark = chapter.querySelector('mark') as HTMLElement;
        expect(mark.style.paddingTop).toBe('');
        expect(mark.style.paddingBottom).toBe('');
    });
});
