import { describe, expect, it } from 'vitest';

import {
  beginTextSelection,
  clampRange,
  clampTextSelection,
  endTextSelection,
  layerEdges,
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
function pointerDownOn(target: EventTarget, button = 0, pointerType = 'mouse'): PointerEvent {
  const event = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button,
    pointerType,
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
});
