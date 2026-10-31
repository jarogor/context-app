import { describe, expect, it } from 'vitest';

import {
    beginTextSelection,
    clampRange,
    clampTextSelection,
    endTextSelection,
    layerEdges,
    moveTextSelection,
} from './text-selection';

/** Текстовый слой страницы с двумя словами. */
function layerWith(first: string, second: string): HTMLElement {
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    for (const text of [first, second]) {
        const span = document.createElement('span');
        span.textContent = text + ' ';
        layer.append(span);
    }
    document.body.append(layer);
    return layer;
}

/** Текстовый узел внутри элемента. */
function textOf(element: Element): Text {
    const node = element.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) {
        throw new Error('у элемента нет текста');
    }
    return node as Text;
}

describe('layerEdges', () => {
    it('даёт крайние позиции текста слоя', () => {
        const layer = layerWith('первое', 'второе');
        const edges = layerEdges(layer);
        const spans = layer.querySelectorAll('span');
        expect(edges).not.toBeNull();
        expect(edges?.start.node).toBe(textOf(spans[0]));
        expect(edges?.start.offset).toBe(0);
        expect(edges?.end.node).toBe(textOf(spans[1]));
        expect(edges?.end.offset).toBe('второе '.length);
    });

    it('пустой слой краёв не даёт', () => {
        const layer = document.createElement('div');
        layer.className = 'textLayer';
        expect(layerEdges(layer)).toBeNull();
    });
});

describe('clampRange', () => {
    it('диапазон внутри слоя не меняется', () => {
        const layer = layerWith('первое', 'второе');
        const spans = layer.querySelectorAll('span');
        const range = document.createRange();
        range.setStart(textOf(spans[0]), 1);
        range.setEnd(textOf(spans[1]), 3);
        expect(clampRange(range, layer)).toBeNull();
    });

    it('конец за слоем ставится на последний текст страницы', () => {
        const layer = layerWith('первое', 'второе');
        const outside = document.createElement('p');
        outside.textContent = 'соседняя страница';
        document.body.append(outside);
        const spans = layer.querySelectorAll('span');
        const range = document.createRange();
        range.setStart(textOf(spans[0]), 2);
        range.setEnd(textOf(outside), 4);
        const clamped = clampRange(range, layer);
        expect(clamped).not.toBeNull();
        expect(clamped?.startContainer).toBe(textOf(spans[0]));
        expect(clamped?.startOffset).toBe(2);
        expect(clamped?.endContainer).toBe(textOf(spans[1]));
        expect(clamped?.endOffset).toBe('второе '.length);
        expect(clamped?.toString()).toBe('рвое второе ');
    });

    it('начало за слоем ставится на первый текст страницы', () => {
        const outside = document.createElement('p');
        outside.textContent = 'соседняя страница';
        document.body.append(outside);
        const layer = layerWith('первое', 'второе');
        const spans = layer.querySelectorAll('span');
        const range = document.createRange();
        range.setStart(textOf(outside), 2);
        range.setEnd(textOf(spans[1]), 3);
        const clamped = clampRange(range, layer);
        expect(clamped).not.toBeNull();
        expect(clamped?.startContainer).toBe(textOf(spans[0]));
        expect(clamped?.startOffset).toBe(0);
        expect(clamped?.endContainer).toBe(textOf(spans[1]));
        expect(clamped?.endOffset).toBe(3);
        expect(clamped?.toString()).toBe('первое вто');
    });
});

/** Нажатие указателя по элементу: событие отправляется цели, чтобы получить её. */
function pointerDownOn(
    target: EventTarget,
    button = 0,
    pointerType = 'mouse',
    point: { x: number; y: number } = { x: 0, y: 0 },
): PointerEvent {
    const event = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button,
        pointerType,
        clientX: point.x,
        clientY: point.y,
    });
    target.dispatchEvent(event);
    return event;
}

describe('beginTextSelection', () => {
    it('протяжка по слову помечает слой и разрешает выделение', () => {
        const layer = layerWith('слово', 'ещё');
        const span = layer.querySelector('span') as HTMLElement;
        const event = pointerDownOn(span);
        beginTextSelection(event);
        expect(document.documentElement.hasAttribute('data-text-selecting')).toBe(true);
        expect(layer.hasAttribute('data-selecting')).toBe(true);
        expect(event.defaultPrevented).toBe(false);
        endTextSelection();
    });

    it('протяжка мимо слова не начинается и отменяет нативное выделение', () => {
        const layer = layerWith('слово', 'ещё');
        const event = pointerDownOn(layer);
        beginTextSelection(event);
        expect(document.documentElement.hasAttribute('data-text-selecting')).toBe(true);
        expect(layer.hasAttribute('data-selecting')).toBe(false);
        expect(event.defaultPrevented).toBe(true);
        endTextSelection();
        expect(document.documentElement.hasAttribute('data-text-selecting')).toBe(false);
    });

    it('касание мимо слова не отменяется: книга прокручивается жестом', () => {
        const layer = layerWith('слово', 'ещё');
        const event = pointerDownOn(layer, 0, 'touch');
        beginTextSelection(event);
        expect(event.defaultPrevented).toBe(false);
        endTextSelection();
    });

    it('средняя кнопка мимо слова не отменяется: вставка работает', () => {
        const layer = layerWith('слово', 'ещё');
        const event = pointerDownOn(layer, 1);
        beginTextSelection(event);
        expect(event.defaultPrevented).toBe(false);
        endTextSelection();
    });
});

describe('clampTextSelection', () => {
    it('выделение другого слоя обрезается слоем протяжки', () => {
        const layer = layerWith('первое', 'второе');
        const other = layerWith('чужое', 'соседнее');
        const span = layer.querySelector('span') as HTMLElement;
        beginTextSelection(pointerDownOn(span));
        const selection = document.getSelection();
        const range = document.createRange();
        const foreign = other.querySelectorAll('span');
        range.setStart(textOf(foreign[0]), 1);
        range.setEnd(textOf(foreign[1]), 2);
        selection?.removeAllRanges();
        selection?.addRange(range);
        clampTextSelection();
        const clamped = selection?.getRangeAt(0);
        expect(clamped?.toString()).toBe('первое второе ');
        expect(clamped?.startContainer.parentElement?.closest('.textLayer')).toBe(layer);
        endTextSelection();
    });

    it('протяжка вниз от двойного клика начинается со слова, а не со строки', () => {
        const layer = layerWith('первое', 'второе');
        const word = wordRange(layer, 0, 'первое'.length);
        const last = layer.querySelectorAll('span')[1];
        /* Двойной клик по слову «первое»: якорь берётся по точке нажатия. Затем
       протяжка к третьему символу второй строки — конец ведётся за кареткой. */
        pressTwice(layer, word.startContainer, 2);
        dragTo(layer, textOf(last), 3);
        const result = document.getSelection()?.getRangeAt(0);
        expect(result?.toString()).toBe('первое вто');
        expect(result?.startContainer).toBe(word.startContainer);
        expect(result?.startOffset).toBe(0);
        expect(result?.endContainer).toBe(textOf(last));
        expect(result?.endOffset).toBe(3);
        endTextSelection();
    });

    it('протяжка вверх от двойного клика ведёт выделение к каретке', () => {
        const layer = layerWith('первое', 'второе');
        const word = wordRange(layer, 1, 'второе'.length);
        const first = layer.querySelectorAll('span')[0];
        pressTwice(layer, word.startContainer, 3);
        dragTo(layer, textOf(first), 2);
        const result = document.getSelection()?.getRangeAt(0);
        // Конец — начало слова-якоря: выше него выделение не поднимается.
        expect(result?.toString()).toBe('рвое ');
        expect(result?.startContainer).toBe(textOf(first));
        expect(result?.startOffset).toBe(2);
        expect(result?.endContainer).toBe(word.startContainer);
        expect(result?.endOffset).toBe(0);
        endTextSelection();
    });

    it('одиночное нажатие якорь-слово не запоминает', () => {
        const layer = layerWith('первое', 'второе');
        const word = wordRange(layer, 0, 'первое'.length);
        const selection = document.getSelection();
        selectRange(selection, word);
        const span = layer.querySelector('span') as HTMLElement;
        beginTextSelection(pointerDownOn(span, 0, 'mouse', { x: 40, y: 40 }));
        const last = layer.querySelectorAll('span')[1];
        const range = document.createRange();
        range.setStart(textOf(layer.querySelectorAll('span')[0]), 0);
        range.setEnd(textOf(last), 3);
        selectRange(selection, range);
        clampTextSelection();
        expect(selection?.getRangeAt(0).toString()).toBe('первое вто');
        endTextSelection();
    });
});

/** Диапазон слова: от начала фрагмента до заданного смещения внутри него. */
function wordRange(layer: Element, spanIndex: number, length: number): Range {
    const span = layer.querySelectorAll('span')[spanIndex];
    const range = document.createRange();
    range.setStart(textOf(span), 0);
    range.setEnd(textOf(span), length);
    return range;
}

/** Два нажатия в одной точке: второе продолжает двойной клик.
 *
 * Якорь-слово берётся по точке нажатия, поэтому попадание каретки подменяется
 * на заданный текстовый узел и смещение.
 */
function pressTwice(layer: Element, node: Node, offset: number): void {
    const span = layer.querySelector('span') as HTMLElement;
    document.caretRangeFromPoint = () => pointOn(node, offset);
    try {
        beginTextSelection(pointerDownOn(span, 0, 'mouse', { x: 70, y: 70 }));
        beginTextSelection(pointerDownOn(span, 0, 'mouse', { x: 70, y: 70 }));
    } finally {
        delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
    }
}

/** Протяжка указателя к заданной позиции текста. */
function dragTo(layer: Element, node: Node, offset: number): void {
    void layer;
    document.caretRangeFromPoint = () => pointOn(node, offset);
    try {
        moveTextSelection(new PointerEvent('pointermove', { clientX: 140, clientY: 40 }));
    } finally {
        delete (document as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
    }
}

/** Свёрнутый диапазон в заданной позиции текста. */
function pointOn(node: Node, offset: number): Range {
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(node, offset);
    return range;
}

/** Выделение диапазона от его начала к концу. */
function selectRange(selection: Selection | null, range: Range): void {
    if (!selection) {
        throw new Error('нет выделения документа');
    }
    selection.removeAllRanges();
    selection.addRange(range);
}
