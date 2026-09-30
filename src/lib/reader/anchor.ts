/** Якорь заметки-цитаты: точное место выделения в тексте книги.
 *
 * Якорь адресует выделение не пикселями, а смещениями символов внутри главы,
 * поэтому не зависит от размера окна, переносов строк и масштаба текста.
 * Сериализация и разбор — чистые функции; разрешение в диапазон DOM работает с
 * документом книги и вынесено сюда же, чтобы модуль чтения оставался тонким.
 */

/** Версия формата якоря. */
export const ANCHOR_VERSION = 1;

/** Якорь выделения внутри одной главы книги. */
export interface QuoteAnchor {
    /** Версия формата. */
    v: number;
    /** Индекс главы книги. */
    chapter: number;
    /** Смещение начала выделения в символах внутри главы. */
    start: number;
    /** Смещение конца выделения в символах внутри главы. */
    end: number;
    /** Выделенный текст. */
    quote: string;
    /** Доля позиции выделения в книге в процентах. */
    percent: number;
    /** Номер страницы для страничных форматов; может отсутствовать. */
    page: number | null;
}

/** Создание якоря выделения с безопасными значениями. */
export function createAnchor(value: Partial<QuoteAnchor>): QuoteAnchor {
    return {
        v: ANCHOR_VERSION,
        chapter: Number.isFinite(value.chapter) ? Number(value.chapter) : 0,
        start: Number.isFinite(value.start) ? Math.max(0, Number(value.start)) : 0,
        end: Number.isFinite(value.end) ? Math.max(0, Number(value.end)) : 0,
        quote: String(value.quote ?? ''),
        percent: Number.isFinite(value.percent) ? Number(value.percent) : 0,
        page: Number.isFinite(value.page) ? Number(value.page) : null,
    };
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
        if (typeof parsed.chapter !== 'number' || typeof parsed.start !== 'number') {
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
