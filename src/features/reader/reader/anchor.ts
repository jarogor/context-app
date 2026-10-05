/** Якорь заметки-цитаты: точное место выделения в тексте книги.
 *
 * Якорь адресует выделение не пикселями, а смещениями символов внутри главы,
 * поэтому не зависит от размера окна, переносов строк и масштаба текста.
 * Для страничных форматов (PDF) якорь адресует страницу и прямоугольники
 * выделения в долях размера страницы — тоже независимо от масштаба.
 * Сериализация и разбор — чистые функции; разрешение в диапазон DOM работает с
 * документом книги и вынесено сюда же, чтобы модуль чтения оставался тонким.
 */

/** Версия формата якоря. */
export const ANCHOR_VERSION = 1;

/** Вид якоря выделения. */
export type AnchorKind = 'text' | 'page' | 'point';

/** Прямоугольник выделения в долях размера страницы. */
export interface AnchorRect {
    /** Доля от левого края страницы. */
    x: number;
    /** Доля от верхнего края страницы. */
    y: number;
    /** Доля ширины страницы. */
    width: number;
    /** Доля высоты страницы. */
    height: number;
}

/** Якорь выделения: внутри главы (текст), на странице (страничный) или точке. */
export interface QuoteAnchor {
    /** Версия формата. */
    v: number;
    /** Вид якоря: смещения символов, страница с прямоугольниками или точка. */
    kind: AnchorKind;
    /** Индекс главы книги (0 для якоря страницы и точки). */
    chapter: number;
    /** Смещение начала выделения в символах внутри главы (0 для страницы и точки). */
    start: number;
    /** Смещение конца выделения в символах внутри главы (0 для страницы и точки). */
    end: number;
    /** Выделенный текст. */
    quote: string;
    /** Доля позиции выделения в книге в процентах. */
    percent: number;
    /** Номер страницы для страничных форматов; может отсутствовать. */
    page: number | null;
    /** Прямоугольники выделения в долях страницы (только страничный якорь). */
    rects?: AnchorRect[];
    /** Доля горизонтали точки в книге (только якорь точки). */
    x?: number;
    /** Доля вертикали точки в книге (только якорь точки). */
    y?: number;
}

/** Создание якоря выделения с безопасными значениями. */
export function createAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
    const kind: AnchorKind =
        value.kind === 'page' ? 'page' : value.kind === 'point' ? 'point' : 'text';
    const anchor: QuoteAnchor = {
        v: ANCHOR_VERSION,
        kind,
        chapter: Number.isFinite(value.chapter) ? Number(value.chapter) : 0,
        start: Number.isFinite(value.start) ? Math.max(0, Number(value.start)) : 0,
        end: Number.isFinite(value.end) ? Math.max(0, Number(value.end)) : 0,
        quote: String(value.quote ?? ''),
        percent: Number.isFinite(value.percent) ? Number(value.percent) : 0,
        page: Number.isFinite(value.page) ? Number(value.page) : null,
    };
    if (kind === 'page') {
        anchor.rects = normalizeRects(value.rects);
    }
    if (kind === 'point') {
        anchor.x = Number.isFinite(value.x) ? Number(value.x) : 0;
        anchor.y = Number.isFinite(value.y) ? Number(value.y) : 0;
    }
    return anchor;
}

/** Создание страничного якоря по странице и прямоугольникам выделения. */
export function createPageAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
    return createAnchor({ ...value, kind: 'page', chapter: 0, start: 0, end: 0 });
}

/** Создание якоря точки по долям её положения в книге. */
export function createPointAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
    return createAnchor({ ...value, kind: 'point', start: 0, end: 0 });
}

/** Признак страничного якоря. */
export function isPageAnchor(anchor: QuoteAnchor): boolean {
    return anchor.kind === 'page';
}

/** Признак якоря точки (текстовая карточка или фигура). */
export function isPointAnchor(anchor: QuoteAnchor): boolean {
    return anchor.kind === 'point';
}

/** Нормализация прямоугольников: конечные числа, неотрицательные размеры. */
function normalizeRects(value: unknown): AnchorRect[] {
    if (!Array.isArray(value)) {
        return [];
    }
    const rects: AnchorRect[] = [];
    for (const item of value) {
        const record = (item ?? {}) as Record<string, unknown>;
        const x = Number(record.x);
        const y = Number(record.y);
        const width = Number(record.width);
        const height = Number(record.height);
        if (![x, y, width, height].every((number) => Number.isFinite(number))) {
            continue;
        }
        rects.push({ x, y, width: Math.max(0, width), height: Math.max(0, height) });
    }
    return rects;
}

/** Сериализация якоря выделения в непрозрачную строку. */
export function serializeAnchor(anchor: QuoteAnchor): string {
    return JSON.stringify(anchor);
}

/** Разбор непрозрачной строки якоря; повреждённая строка даёт null. */
export function parseAnchor(value: string | null | undefined): QuoteAnchor | null {
    if (!value) {
        return null;
    }
    try {
        const parsed = JSON.parse(value) as Partial<QuoteAnchor>;
        if (typeof parsed !== 'object' || parsed === null) {
            return null;
        }
        const isPage = parsed.kind === 'page';
        const isPoint = parsed.kind === 'point';
        if (isPoint && (typeof parsed.x !== 'number' || typeof parsed.y !== 'number')) {
            // Якорь точки без координат бессмысленен — считаем повреждённым.
            return null;
        }
        if (
            !isPage &&
            !isPoint &&
            (typeof parsed.chapter !== 'number' || typeof parsed.start !== 'number')
        ) {
            return null;
        }
        return createAnchor(parsed);
    } catch {
        return null;
    }
}

/** Смещение точки диапазона в символах относительно начала главы. */
function offsetWithin(document: Document, root: Node, node: Node, offset: number): number {
    const range = document.createRange();
    range.setStart(root, 0);
    range.setEnd(node, offset);
    return range.toString().length;
}

/** Диапазон выделения в смещениях символов внутри главы. */
export interface SelectionOffsets {
    /** Смещение начала выделения. */
    start: number;
    /** Смещение конца выделения. */
    end: number;
}

/** Вычисление смещений выделения внутри главы. */
export function offsetsFromRange(root: Node, range: Range): SelectionOffsets | null {
    const document = root.ownerDocument;
    if (!document || !root.contains(range.startContainer) || !root.contains(range.endContainer)) {
        return null;
    }
    const start = offsetWithin(document, root, range.startContainer, range.startOffset);
    const end = offsetWithin(document, root, range.endContainer, range.endOffset);
    if (end <= start) {
        return null;
    }
    return { start, end };
}

/** Разрешение смещений символов в диапазон DOM внутри главы. */
export function rangeFromOffsets(root: Node, start: number, end: number): Range | null {
    const document = root.ownerDocument;
    if (!document) {
        return null;
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    let startNode: Node | null = null;
    let startOffset = 0;
    let endNode: Node | null = null;
    let endOffset = 0;
    let node = walker.nextNode();
    while (node) {
        const length = node.nodeValue?.length ?? 0;
        if (!startNode && start <= position + length) {
            startNode = node;
            startOffset = start - position;
        }
        if (end <= position + length) {
            endNode = node;
            endOffset = end - position;
            break;
        }
        position += length;
        node = walker.nextNode();
    }
    if (!startNode || !endNode) {
        return null;
    }
    try {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        return range;
    } catch {
        return null;
    }
}
