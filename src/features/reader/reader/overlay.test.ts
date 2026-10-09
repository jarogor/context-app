import { describe, expect, it } from 'vitest';
import {
    clearNoteOverlays,
    NOTE_CARD_CLASS,
    NOTE_OVERLAY_CLASS,
    NOTE_SHAPE_CLASS,
    parseGeometry,
    renderShape,
    renderTextCard,
    serializeGeometry,
} from './overlay';
import type { Note } from '../../notes/notes';
import { normalizeNote } from '../../notes/notes';
import { createAnchor, serializeAnchor } from './anchor';

/** Корневой раздел главы. */
function section(html = ''): HTMLElement {
    const element = document.createElement('div');
    element.innerHTML = html;
    return element;
}

/** Заметка типа «текст» с якорем точки. */
function textNote(overrides: Partial<Note> = {}): Note {
    return {
        ...normalizeNote({
            id: 'text-1',
            type: 'text',
            text: 'Моя мысль',
            color: 'green',
            anchor: serializeAnchor(createAnchor({ kind: 'point', chapter: 0, x: 0.25, y: 0.5 })),
        }),
        ...overrides,
    };
}

/** Заметка-фигура с якорем точки и геометрией. */
function shapeNote(shape: 'line' | 'rectangle' | 'ellipse', overrides: Partial<Note> = {}): Note {
    return {
        ...normalizeNote({
            id: 'shape-1',
            type: 'shape',
            shape,
            color: 'purple',
            anchor: serializeAnchor(createAnchor({ kind: 'point', chapter: 0, x: 0.1, y: 0.1 })),
            geometry: serializeGeometry({ x1: 0.1, y1: 0.2, x2: 0.6, y2: 0.8 }),
        }),
        ...overrides,
    };
}

describe('геометрия фигуры', () => {
    it('переживает круговой обход', () => {
        const geometry = { x1: 0.1, y1: 0.2, x2: 0.6, y2: 0.8 };
        expect(parseGeometry(serializeGeometry(geometry))).toEqual(geometry);
    });

    it('повреждённая строка даёт null', () => {
        expect(parseGeometry('не json')).toBeNull();
        expect(parseGeometry('')).toBeNull();
        expect(parseGeometry(null)).toBeNull();
        expect(parseGeometry('{"x1":0.1}')).toBeNull();
        expect(parseGeometry('{"x1":"нет","y1":0,"x2":1,"y2":1}')).toBeNull();
    });
});

describe('карточка текста', () => {
    it('накладывается по точке якоря в долях области', () => {
        const root = section('<p>Текст</p>');
        expect(renderTextCard(root, textNote())).toBe(true);

        const card = root.querySelector(`.${NOTE_CARD_CLASS}`) as HTMLElement;
        expect(card).not.toBeNull();
        expect(card.textContent).toBe('Моя мысль');
        expect(card.dataset.noteId).toBe('text-1');
        expect(card.dataset.color).toBe('green');
        expect(card.style.left).toBe('25%');
        expect(card.style.top).toBe('50%');
    });

    it('не рисуется для не-точечного якоря', () => {
        const root = section();
        const note = textNote({
            anchor: serializeAnchor(createAnchor({ chapter: 0, start: 0, end: 3, quote: 'ц' })),
        });
        expect(renderTextCard(root, note)).toBe(false);
        expect(root.querySelector(`.${NOTE_CARD_CLASS}`)).toBeNull();
    });
});

describe('фигура', () => {
    it('рисует линию', () => {
        const root = section();
        expect(renderShape(root, shapeNote('line'))).toBe(true);
        expect(root.querySelector('line')).not.toBeNull();
        expect(root.querySelector(`.${NOTE_SHAPE_CLASS}`)).not.toBeNull();
    });

    it('рисует прямоугольник по границам протяжки', () => {
        const root = section();
        renderShape(root, shapeNote('rectangle'));
        const rect = root.querySelector('rect') as SVGRectElement;
        expect(rect).not.toBeNull();
        // Координаты нормированы в рамку фигуры (viewBox 0 0 1 1), не в доли главы.
        expect(rect.getAttribute('x')).toBe('0');
        expect(rect.getAttribute('y')).toBe('0');
        expect(rect.getAttribute('width')).toBe('1');
        expect(rect.getAttribute('height')).toBe('1');
    });

    it('рисует эллипс, вписанный в границы', () => {
        const root = section();
        renderShape(root, shapeNote('ellipse'));
        const ellipse = root.querySelector('ellipse') as SVGEllipseElement;
        expect(ellipse).not.toBeNull();
        expect(ellipse.getAttribute('cx')).toBe('0.5');
        expect(ellipse.getAttribute('cy')).toBe('0.5');
        expect(ellipse.getAttribute('rx')).toBe('0.5');
        expect(ellipse.getAttribute('ry')).toBe('0.5');
    });

    it('несёт идентификатор, вид и цвет заметки', () => {
        const root = section();
        renderShape(root, shapeNote('rectangle'));
        const svg = root.querySelector(`.${NOTE_SHAPE_CLASS}`) as SVGElement;
        expect(svg.dataset.noteId).toBe('shape-1');
        expect(svg.dataset.shape).toBe('rectangle');
        expect(svg.dataset.color).toBe('purple');
    });

    it('слой занимает рамку фигуры, а не всю главу', () => {
        // У высоких глав слой во всю главу WebKit не рисует: фигура есть в
        // разметке, но невидима. Поэтому слой сжимается до рамки фигуры.
        const root = section();
        renderShape(root, shapeNote('rectangle'));
        const svg = root.querySelector(`.${NOTE_SHAPE_CLASS}`) as SVGElement;
        expect(svg.style.left).toBe('10%');
        expect(svg.style.top).toBe('20%');
        expect(svg.style.width).toBe('50%');
        expect(svg.style.height).toBe('60%');
    });

    it('держит viewBox единичным, а не в долях рамки', () => {
        // Крошечный `viewBox` (доли рамки: масштаб в десятки тысяч) WebKit не
        // отрисовывает, поэтому `viewBox` всегда `0 0 1 1`, а координаты
        // переводятся в локальные доли рамки.
        const root = section();
        renderShape(root, shapeNote('rectangle'));
        const svg = root.querySelector(`.${NOTE_SHAPE_CLASS}`) as SVGElement;
        expect(svg.getAttribute('viewBox')).toBe('0 0 1 1');
    });

    it('нулевой стороне линии даёт минимальный размер слоя', () => {
        // Строго горизонтальная или вертикальная линия имеет нулевую сторону;
        // нулевой размер viewBox не рисуется, поэтому сторона поднимается и
        // фигура центрируется в ней.
        const root = section();
        renderShape(
            root,
            shapeNote('line', {
                geometry: serializeGeometry({ x1: 0.1, y1: 0.5, x2: 0.6, y2: 0.5 }),
            }),
        );
        const svg = root.querySelector(`.${NOTE_SHAPE_CLASS}`) as SVGElement;
        expect(svg.style.height).toBe('0.05%');
    });

    it('кладет прозрачную мишень контура, не дублируя фигуру', () => {
        const root = section();
        renderShape(root, shapeNote('rectangle'));
        const svg = root.querySelector(`.${NOTE_SHAPE_CLASS}`) as SVGElement;
        expect(svg.querySelectorAll('rect')).toHaveLength(1);
        const hit = svg.querySelector('path');
        expect(hit).not.toBeNull();
        expect(hit?.getAttribute('d')).toBe('M0 0H1V1H0Z');
    });

    it('мишень линии повторяет её концы', () => {
        const root = section();
        renderShape(root, shapeNote('line'));
        const hit = root.querySelector(`.${NOTE_SHAPE_CLASS} path`);
        expect(hit?.getAttribute('d')).toBe('M0 0L1 1');
    });

    it('не рисуется без геометрии', () => {
        const root = section();
        expect(renderShape(root, shapeNote('line', { geometry: '' }))).toBe(false);
    });
});

describe('снятие наложений', () => {
    it('удаляет карточки и фигуры, не трогая текст', () => {
        const root = section('<p>Текст</p>');
        renderTextCard(root, textNote());
        renderShape(root, shapeNote('line'));
        expect(root.querySelectorAll(`.${NOTE_OVERLAY_CLASS}`).length).toBe(2);

        clearNoteOverlays(root, `.${NOTE_OVERLAY_CLASS}`);

        expect(root.querySelectorAll(`.${NOTE_OVERLAY_CLASS}`).length).toBe(0);
        expect(root.innerHTML).toBe('<p>Текст</p>');
    });
});
