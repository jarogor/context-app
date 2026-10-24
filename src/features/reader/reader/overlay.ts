/** Наложения заметок типов «текст» и «фигура» в документе книги.
 *
 * Карточка позиционируется в долях области раздела главы, фигура рисуется SVG в
 * тех же долях. Доли не зависят от масштаба и переносов, поэтому наложения
 * следуют за прокруткой и не смещаются при перестройке текста. Снятие наложений
 * разворачивает разметку, не трогая текст книги.
 */

import { parseAnchor } from './anchor';
import type { Note } from '../../notes/notes';

/** Класс всех наложений заметок. */
export const NOTE_OVERLAY_CLASS = 'context-overlay';
/** Класс текстовой карточки. */
export const NOTE_CARD_CLASS = 'context-note-card';
/** Класс SVG-слоя фигуры. */
export const NOTE_SHAPE_CLASS = 'context-note-shape';

/** Геометрия фигуры: две точки (концы линии либо противоположные углы области). */
export interface ShapeGeometry {
    /** Доля горизонтали первой точки. */
    x1: number;
    /** Доля вертикали первой точки. */
    y1: number;
    /** Доля горизонтали второй точки. */
    x2: number;
    /** Доля вертикали второй точки. */
    y2: number;
}

/** Разбор непрозрачной геометрии фигуры; повреждённая строка даёт null. */
export function parseGeometry(value: string | null | undefined): ShapeGeometry | null {
    if (!value) {
        return null;
    }
    try {
        const parsed = JSON.parse(value) as Partial<Record<keyof ShapeGeometry, unknown>>;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const coordinates = [parsed.x1, parsed.y1, parsed.x2, parsed.y2];
        if (!coordinates.every((number) => typeof number === 'number' && Number.isFinite(number))) {
            return null;
        }
        return {
            x1: Number(parsed.x1),
            y1: Number(parsed.y1),
            x2: Number(parsed.x2),
            y2: Number(parsed.y2),
        };
    } catch {
        return null;
    }
}

/** Сериализация геометрии фигуры в непрозрачную строку. */
export function serializeGeometry(geometry: ShapeGeometry): string {
    return JSON.stringify(geometry);
}

/** Снятие наложений заметок без изменения текста книги. */
export function clearNoteOverlays(root: ParentNode, selector: string): void {
    for (const overlay of Array.from(root.querySelectorAll(selector))) {
        overlay.remove();
    }
}

/** Наложение текстовой карточки в разделе главы по точке её якоря. */
export function renderTextCard(section: Element, note: Note): boolean {
    const anchor = parseAnchor(note.anchor);
    if (!anchor || anchor.kind !== 'point') {
        return false;
    }
    const document = section.ownerDocument;
    const card = document.createElement('div');
    card.className = `${NOTE_OVERLAY_CLASS} ${NOTE_CARD_CLASS}`;
    card.dataset.noteId = note.id;
    card.dataset.color = note.color;
    card.style.left = `${(anchor.x ?? 0) * 100}%`;
    card.style.top = `${(anchor.y ?? 0) * 100}%`;
    card.textContent = note.text;
    section.appendChild(card);
    return true;
}

/** Наложение фигуры в разделе главы по её виду и геометрии. */
export function renderShape(section: Element, note: Note): boolean {
    const anchor = parseAnchor(note.anchor);
    const geometry = parseGeometry(note.geometry);
    if (!anchor || anchor.kind !== 'point' || !geometry) {
        return false;
    }
    const document = section.ownerDocument;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', `${NOTE_OVERLAY_CLASS} ${NOTE_SHAPE_CLASS}`);
    // Слой занимает рамку фигуры, а не всю главу, а координаты внутри слоя
    // нормируются в 0..1. Растягивать слой на всю главу нельзя: у реальных книг
    // раздел главы бывает в десятки тысяч пикселей высотой. Но и задавать
    // `viewBox` в долях рамки (крошечный, с масштабом в десятки тысяч) нельзя:
    // такой SVG WebKit не отрисовывает — фигура есть в разметке, её можно
    // выбрать и перетащить, но на странице её не видно. Поэтому `viewBox` всегда
    // `0 0 1 1`, а точки фигуры переводятся в локальные доли рамки.
    const bounds = shapeBounds(geometry, section);
    const toLocalX = (value: number) => (value - bounds.left) / bounds.width;
    const toLocalY = (value: number) => (value - bounds.top) / bounds.height;
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.left = `${round(bounds.left * 100)}%`;
    svg.style.top = `${round(bounds.top * 100)}%`;
    svg.style.width = `${round(bounds.width * 100)}%`;
    svg.style.height = `${round(bounds.height * 100)}%`;
    (svg as unknown as HTMLElement).dataset.noteId = note.id;
    (svg as unknown as HTMLElement).dataset.color = note.color;
    svg.dataset.shape = note.shape;
    const local = {
        x1: toLocalX(geometry.x1),
        y1: toLocalY(geometry.y1),
        x2: toLocalX(geometry.x2),
        y2: toLocalY(geometry.y2),
    };
    const element = shapeElement(document, note.shape, local);
    svg.appendChild(element);
    // Широкая прозрачная мишень по контуру: по видимой линии в 2px трудно
    // попасть, поэтому выбор фигуры кликом почти не срабатывал. Мишень — `<path>`,
    // а не копия фигуры, чтобы не удваивать её элементы в разметке; она
    // перехватывает только область контура и не мешает тексту внутри фигуры.
    const hit = shapeHitElement(document, note.shape, local);
    svg.appendChild(hit);
    section.appendChild(svg);
    return true;
}

/** Округление координаты до разумной точности долей, чтобы убрать шум float. */
function round(value: number): number {
    return Math.round(value * 1e6) / 1e6;
}

/** Рамка фигуры в долях раздела: положение и размер слоя SVG.
 *
 * Минимальная сторона не даёт слою выродиться в ноль у строго горизонтальной
 * или вертикальной линии (нулевой размер viewBox не рисуется) и держит не
 * меньше ~24 px экрана, чтобы прозрачная мишень фигуры оставалась кликабельной.
 * Фигура центрируется в расширенной стороне.
 */
function shapeBounds(
    geometry: ShapeGeometry,
    section: Element,
): { left: number; top: number; width: number; height: number } {
    const rect = section.getBoundingClientRect();
    const minWidth = rect.width > 0 ? 24 / rect.width : 0.0005;
    const minHeight = rect.height > 0 ? 24 / rect.height : 0.0005;
    const { x1, y1, x2, y2 } = geometry;
    const width = Math.max(Math.abs(x2 - x1), minWidth);
    const height = Math.max(Math.abs(y2 - y1), minHeight);
    return {
        left: Math.min(x1, x2) - (width - Math.abs(x2 - x1)) / 2,
        top: Math.min(y1, y2) - (height - Math.abs(y2 - y1)) / 2,
        width,
        height,
    };
}

/** Создание SVG-элемента фигуры по её виду и геометрии. */
function shapeElement(
    document: Document,
    shape: string,
    geometry: ShapeGeometry,
): SVGElement {
    const { x1, y1, x2, y2 } = geometry;
    if (shape === 'rectangle') {
        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', String(round(Math.min(x1, x2))));
        rect.setAttribute('y', String(round(Math.min(y1, y2))));
        rect.setAttribute('width', String(round(Math.abs(x2 - x1))));
        rect.setAttribute('height', String(round(Math.abs(y2 - y1))));
        return rect;
    }
    if (shape === 'ellipse') {
        const ellipse = document.createElementNS('http://www.w3.org/2000/svg', 'ellipse');
        ellipse.setAttribute('cx', String(round((x1 + x2) / 2)));
        ellipse.setAttribute('cy', String(round((y1 + y2) / 2)));
        ellipse.setAttribute('rx', String(round(Math.abs(x2 - x1) / 2)));
        ellipse.setAttribute('ry', String(round(Math.abs(y2 - y1) / 2)));
        return ellipse;
    }
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(round(x1)));
    line.setAttribute('y1', String(round(y1)));
    line.setAttribute('x2', String(round(x2)));
    line.setAttribute('y2', String(round(y2)));
    return line;
}

/** Создание прозрачной широкой мишени по контуру фигуры (`<path>`).
 *
 * Тонкая видимая линия почти не кликается, поэтому рядом с фигурой кладётся
 * неширокая прозрачная обводка по тому же контуру. Тип `path` выбран, чтобы не
 * добавлять в разметку вторые `line`/`rect`/`ellipse` и не ломать подсчёты.
 */
function shapeHitElement(
    document: Document,
    shape: string,
    geometry: ShapeGeometry,
): SVGElement {
    const { x1, y1, x2, y2 } = geometry;
    let data: string;
    if (shape === 'rectangle') {
        const left = round(Math.min(x1, x2));
        const top = round(Math.min(y1, y2));
        const right = round(Math.max(x1, x2));
        const bottom = round(Math.max(y1, y2));
        data = `M${left} ${top}H${right}V${bottom}H${left}Z`;
    } else if (shape === 'ellipse') {
        const cx = round((x1 + x2) / 2);
        const cy = round((y1 + y2) / 2);
        const rx = round(Math.abs(x2 - x1) / 2);
        const ry = round(Math.abs(y2 - y1) / 2);
        data =
            `M${round(cx - rx)} ${cy}` +
            `A${rx} ${ry} 0 1 0 ${round(cx + rx)} ${cy}` +
            `A${rx} ${ry} 0 1 0 ${round(cx - rx)} ${cy}Z`;
    } else {
        data = `M${round(x1)} ${round(y1)}L${round(x2)} ${round(y2)}`;
    }
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', data);
    return path;
}
