/** Подсветка найденного поиском в тексте книги.
 *
 * Отдельно от подсветки заметок: найденное — рабочий слой поиска, его
 * разметка снимается без следа (поиск перезапускается на каждый запрос и на
 * каждый переход), а заметки должны переживать любой поиск. Поэтому классы и
 * идентификаторы здесь свои.
 *
 * Разметка ставится за один обход текста главы: смещения всех вхождений
 * раскладываются по текстовым узлам заранее, а `<mark>` вставляется уже внутри
 * узла. Обход дерева на каждое вхождение (как при поиске места цитаты) на книге
 * с сотнями вхождений занимал секунды и подвешивал интерфейс.
 */

/** Класс подсветки найденного поиском. */
export const SEARCH_CLASS = 'context-search-hit';
/** Класс подсветки вхождения, перед которым стоит переход. */
export const SEARCH_ACTIVE_CLASS = 'context-search-hit-active';

/** Снятие подсветки поиска: разметка разворачивается обратно. */
export function clearSearchHighlights(root: ParentNode): void {
    for (const mark of Array.from(root.querySelectorAll(`mark.${SEARCH_CLASS}`))) {
        const parent = mark.parentNode;
        if (!parent) {
            continue;
        }
        while (mark.firstChild) {
            parent.insertBefore(mark.firstChild, mark);
        }
        parent.removeChild(mark);
    }
}

/** Текстовые узлы главы с началом каждого в смещениях символов главы. */
interface TextNodeAt {
    /** Текстовый узел. */
    node: Text;
    /** Смещение начала узла в тексте главы. */
    start: number;
    /** Длина текста узла. */
    length: number;
}

/** Текстовые узлы главы в порядке документа. */
function textNodes(root: Element): TextNodeAt[] {
    const document = root.ownerDocument;
    if (!document) {
        return [];
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes: TextNodeAt[] = [];
    let position = 0;
    let node = walker.nextNode();
    while (node) {
        const text = node as Text;
        const length = text.nodeValue?.length ?? 0;
        nodes.push({ node: text, start: position, length });
        position += length;
        node = walker.nextNode();
    }
    return nodes;
}

/** Узел и смещение в нём по смещению символа в тексте главы. */
function locate(
    nodes: TextNodeAt[],
    offset: number,
): { node: Text; offset: number } | null {
    if (nodes.length === 0) {
        return null;
    }
    let low = 0;
    let high = nodes.length - 1;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        if (nodes[middle].start <= offset) {
            low = middle;
        } else {
            high = middle - 1;
        }
    }
    const found = nodes[low];
    if (offset < found.start || offset > found.start + found.length) {
        return null;
    }
    return { node: found.node, offset: offset - found.start };
}

/** Подсветка всех вхождений в главе по их смещениям символов.
 *
 * Возвращает `true`, если подсвечено хотя бы одно вхождение. Смещения
 * раскладываются по узлам заранее, а разметка в каждом узле ставится от конца к
 * началу: вставка `<mark>` сдвигает текст только своего узла.
 *
 * Каждый кусок помнит начало своего вхождения (`data-start`): по нему переход
 * находит и выделяет все куски одного вхождения, не пересобирая подсветку.
 */
export function highlightSearchHits(
    root: Element,
    hits: Array<{ start: number; end: number }>,
    activeStart: number | null = null,
): boolean {
    const document = root.ownerDocument;
    if (!document || hits.length === 0) {
        return false;
    }
    const nodes = textNodes(root);
    if (nodes.length === 0) {
        return false;
    }
    /** Куски для подсветки по узлам: границы в смещениях внутри узла. */
    const fragments = new Map<Text, Array<{ from: number; to: number; start: number }>>();
    for (const hit of hits) {
        const first = locate(nodes, hit.start);
        const last = locate(nodes, hit.end);
        if (!first || !last) {
            continue;
        }
        // Вхождение может пересекать несколько узлов (например, границу
        // `em`): каждый затронутый кусок подсвечивается отдельно.
        const from = first.node;
        const to = last.node;
        if (from === to) {
            pushFragment(fragments, from, first.offset, last.offset, hit.start);
            continue;
        }
        let reached = false;
        for (const node of nodes) {
            if (node.node === from) {
                reached = true;
                pushFragment(fragments, node.node, first.offset, node.length, hit.start);
                continue;
            }
            if (!reached) {
                continue;
            }
            if (node.node === to) {
                pushFragment(fragments, node.node, 0, last.offset, hit.start);
                break;
            }
            pushFragment(fragments, node.node, 0, node.length, hit.start);
        }
    }
    let marked = false;
    for (const [node, spans] of fragments) {
        // Куски одного узла собираются в новое содержимое узла за один раз:
        // каждая вставка `<mark>` по одной перестраивала бы весь текст узла, и
        // на сотнях вхождений в длинном узле это занимало секунды.
        const text = node.nodeValue ?? '';
        const ordered = [...spans]
            .filter((span) => span.to > span.from)
            .sort((first, second) => first.from - second.from);
        if (ordered.length === 0) {
            continue;
        }
        const replacement = document.createDocumentFragment();
        let position = 0;
        for (const span of ordered) {
            const from = Math.max(position, Math.min(span.from, text.length));
            const to = Math.max(from, Math.min(span.to, text.length));
            if (from > position) {
                replacement.append(text.slice(position, from));
            }
            if (to > from) {
                const mark = document.createElement('mark');
                mark.dataset.start = String(span.start);
                mark.className =
                    span.start === activeStart
                        ? `${SEARCH_CLASS} ${SEARCH_ACTIVE_CLASS}`
                        : SEARCH_CLASS;
                mark.textContent = text.slice(from, to);
                replacement.append(mark);
                marked = true;
            }
            position = Math.max(position, to);
        }
        if (position < text.length) {
            replacement.append(text.slice(position));
        }
        node.replaceWith(replacement);
    }
    return marked;
}

/** Добавление куска подсветки в узел. */
function pushFragment(
    fragments: Map<Text, Array<{ from: number; to: number; start: number }>>,
    node: Text,
    from: number,
    to: number,
    start: number,
): void {
    const spans = fragments.get(node);
    if (spans) {
        spans.push({ from, to, start });
    } else {
        fragments.set(node, [{ from, to, start }]);
    }
}
