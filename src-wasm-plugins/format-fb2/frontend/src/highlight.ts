/** Подсветка заметок-цитат в текстовом документе книги.
 *
 * Подсветка накладывается на текст книги, а не на блоки разметки: диапазон
 * выделения разбивается по текстовым узлам, и каждый пересечённый фрагмент
 * оборачивается в собственный `<mark>`. Это устойчиво к вложенной разметке
 * (`<em>`, `<strong>`, ссылки) и к частичному попаданию границ выделения внутрь
 * узла: `Range.surroundContents` по диапазону, частично содержащему элемент,
 * бросает исключение и оставляет подсветку невидимой.
 */

/** Снятие подсветок заметок: разметочные элементы разворачиваются обратно. */
export function clearNoteMarks(root: ParentNode, selector: string): void {
    for (const mark of Array.from(root.querySelectorAll(selector))) {
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

/** Подсветка диапазона текста по смещениям символов внутри главы.
 *
 * Смещения считаются по тексту главы (как в якоре заметки), поэтому подсветка
 * не зависит от разметки. Возвращается `true`, если подсвечен хотя бы один
 * фрагмент.
 */
export function highlightTextRange(
    root: Node,
    start: number,
    end: number,
    className: string,
    noteId: string,
    color = 'yellow',
): boolean {
    const document = root.ownerDocument;
    if (!document || end <= start) {
        return false;
    }
    // Сначала собираются текстовые узлы со смещениями: подсветка меняет дерево,
    // и обход одновременно с мутацией пропускал бы или повторял узлы.
    const parts: Array<{ node: Text; from: number; to: number }> = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let position = 0;
    let node = walker.nextNode();
    while (node) {
        const text = node as Text;
        const length = text.nodeValue?.length ?? 0;
        const nodeStart = position;
        const nodeEnd = position + length;
        position = nodeEnd;
        const from = Math.max(start, nodeStart);
        const to = Math.min(end, nodeEnd);
        if (from < to) {
            parts.push({ node: text, from: from - nodeStart, to: to - nodeStart });
        }
        node = walker.nextNode();
    }
    for (const part of parts) {
        const range = document.createRange();
        range.setStart(part.node, part.from);
        range.setEnd(part.node, part.to);
        const mark = document.createElement('mark');
        mark.className = className;
        mark.dataset.noteId = noteId;
        mark.dataset.color = color;
        range.surroundContents(mark);
        fitMarkToLineHeight(mark);
    }
    return parts.length > 0;
}

/** Выравнивание фона подсветки по высоте строки.
 *
 * Фон строчного `<mark>` покрывает только кегельную площадку, а она ниже
 * `line-height`: между строками подсветки заметки остаются щели, которых нет в
 * PDF (там полосы строк уже включают межстрочный интервал; см. `lineRects`
 * плагина). Вертикальные отступы в `em` расширяют фон до высоты строки и
 * переживают масштабирование, а `box-decoration-break: clone` (задан в CSS
 * заметки) даёт каждому перенесённому куску свои отступы — полосы стыкуются
 * встык. Вертикальные отступы строчного элемента не меняют вёрстку строки.
 *
 * К высоте строки добавляется половина пикселя перекрытия: при дробном
 * масштабе соседние куски ложатся не идеально, и без запаса на границе видна
 * тонкая щель. Полупрозрачный тон на таком перекрытии давал бы тёмную полосу,
 * поэтому фон подсветки непрозрачен (`--note-solid-*` в `reader-document.ts`),
 * и перекрытие кусков незаметно.
 */
function fitMarkToLineHeight(mark: HTMLElement): void {
    const view = mark.ownerDocument.defaultView;
    const parent = mark.parentElement;
    const style = view && parent ? view.getComputedStyle(parent) : null;
    const lineHeight = style ? Number.parseFloat(style.lineHeight) : Number.NaN;
    const fontSize = style ? Number.parseFloat(style.fontSize) : Number.NaN;
    const rect = mark.getClientRects()[0];
    if (
        !style ||
        !Number.isFinite(lineHeight) ||
        !Number.isFinite(fontSize) ||
        fontSize <= 0 ||
        !rect ||
        rect.height <= 0
    ) {
        return;
    }
    /** Запас перекрытия соседних кусков на каждую сторону, в пикселях. */
    const overlap = 0.25;
    const base = (lineHeight - rect.height) / 2 / fontSize;
    if (base > 0) {
        const padding = base + overlap / fontSize;
        mark.style.paddingTop = `${padding}em`;
        mark.style.paddingBottom = `${padding}em`;
    }
}
