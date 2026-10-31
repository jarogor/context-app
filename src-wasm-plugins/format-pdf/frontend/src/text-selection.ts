/** Ограничение живого выделения текстовым слоем страницы.
 *
 * Браузер достраивает выделение от ближайшего текста до указателя, поэтому
 * протяжка, начатая в поле страницы (мимо слова, между строками, по канвасу
 * растра) или уведённая за страницу, давала выделение всего документа — как
 * область, а не как текст. Здесь выделение начинается только на слове
 * текстового слоя и остаётся в пределах этого слоя: концам диапазона, вышедшим
 * за слой, ставится крайний текст страницы.
 *
 * Пока идёт протяжка, нативное выделение браузера выключено (`user-select`),
 * иначе движок успевает добавить к диапазону текст из соседних слоёв раньше,
 * чем его можно обрезать.
 *
 * Отдельный случай — протяжка, начатая повторным нажатием после двойного клика.
 * Для движка это уже третье нажатие подряд, то есть выбор блока: якорем
 * становится начало инлайн-куска слоя (в текстовом слое pdf.js кусок — целая
 * строка), и выделение тянется от её начала, а не от выделенного слова. Поэтому
 * выделенное слово запоминается при нажатии и остаётся якорем протяжки: конец
 * ведётся за указателем, а прежнее выделение не расширяется вверх.
 */
import { TEXT_LAYER_CLASS, elementOf } from './dom';

/** Признак идущей протяжки выделения на корне документа. */
const TEXT_SELECTING_ATTR = 'data-text-selecting';
/** Признак слоя, с которого начата протяжка выделения. */
const TEXT_ANCHOR_ATTR = 'data-selecting';
/** Предел между нажатиями одного двойного клика, мс. */
const DOUBLE_PRESS_MILLIS = 500;
/** Допуск положения между нажатиями одного жеста, px. */
const PRESS_SLACK_PX = 5;
/** Сдвиг указателя, с которого начинается протяжка (а не клик), px. */
const DRAG_THRESHOLD_PX = 3;

/** Позиция каретки в текстовом слое. */
interface Edge {
    /** Текстовый узел. */
    node: Node;
    /** Смещение внутри узла. */
    offset: number;
}

/** Слой, с которого начата протяжка выделения. */
let anchorLayer: Element | null = null;

/** Выделенное слово, от которого продолжается протяжка, или null. */
let anchorWord: Range | null = null;

/** Последнее слово, которое движок выделил двойным кликом.
 *
 * Запоминается на `selectionchange`, когда выделение ещё не растянуто:
 * WebKit применяет выбор блока (всю строку) раньше, чем доходит до обработчика
 * нажатия, поэтому в момент начала протяжки выделение брать нельзя — оно уже
 * испорчено. Живое слово остаётся здесь до следующего выделения.
 */
let lastDoubleClickedWord: Range | null = null;

/** Точка нажатия, продолжающего двойной клик, пока протяжка не началась. */
let anchorPress: { x: number; y: number } | null = null;

/** Признак того, что указатель действительно сдвинулся после нажатия. */
let anchorMoved = false;

/** Последняя точка указателя во время протяжки от якоря-слова. */
let dragPoint: { x: number; y: number } | null = null;

/** Положение и время последнего нажатия: по ним распознаётся двойной клик. */
let lastPress = { time: 0, x: 0, y: 0, count: 0 };

/** Защита от повторного входа при собственной правке выделения. */
let clamping = false;

/** Текстовый слой и слово, на котором начата протяжка, или null. */
function anchorOf(target: EventTarget | null): Element | null {
    const span = target instanceof Element ? target.closest(`.${TEXT_LAYER_CLASS} span`) : null;
    return span ? span.closest(`.${TEXT_LAYER_CLASS}`) : null;
}

/** Крайние текстовые позиции слоя в порядке чтения. */
export function layerEdges(layer: Element): { start: Edge; end: Edge } | null {
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    let first: Node | null = null;
    let last: Node | null = null;
    let node = walker.nextNode();
    while (node) {
        const text = node as Text;
        if (text.data.length > 0) {
            first = first || text;
            last = text;
        }
        node = walker.nextNode();
    }
    if (!first || !last) {
        return null;
    }
    return {
        start: { node: first, offset: 0 },
        end: { node: last, offset: (last as Text).data.length },
    };
}

/** Обрезка диапазона краями текстового слоя.
 *
 * Возвращает `null`, если диапазон целиком лежит в слое и менять его не нужно.
 * Концы, оказавшиеся вне слоя, ставятся на крайний текст страницы, поэтому
 * выделение не выходит за её пределы и не превращается в область документа.
 */
export function clampRange(range: Range, layer: Element): Range | null {
    const startInside = layer.contains(range.startContainer);
    const endInside = layer.contains(range.endContainer);
    if (startInside && endInside) {
        return null;
    }
    const edges = layerEdges(layer);
    if (!edges) {
        return null;
    }
    const next = document.createRange();
    if (startInside) {
        next.setStart(range.startContainer, range.startOffset);
    } else {
        next.setStart(edges.start.node, edges.start.offset);
    }
    if (endInside) {
        next.setEnd(range.endContainer, range.endOffset);
    } else {
        next.setEnd(edges.end.node, edges.end.offset);
    }
    return next.collapsed ? null : next;
}

/** Снятие текущего выделения без повторной обработки. */
function clearSelection(): void {
    const selection = document.getSelection();
    if (!selection || selection.rangeCount === 0) {
        return;
    }
    clamping = true;
    try {
        selection.removeAllRanges();
    } finally {
        clamping = false;
    }
}

/** Отметки протяжки: корень документа и слой, с которого она началась. */
function mark(layer: Element | null): void {
    document.documentElement.setAttribute(TEXT_SELECTING_ATTR, '');
    if (layer) {
        layer.setAttribute(TEXT_ANCHOR_ATTR, '');
    }
}

/** Номер нажатия в текущей серии: 1 — одиночное, 2 и далее — двойной клик.
 *
 * Считается по положению и времени нажатий, а не по `detail`: в WebKit у
 * события указателя `detail` всегда 1, и распознать двойной клик по нему нельзя.
 */
function pressCount(event: PointerEvent): number {
    const time = event.timeStamp || performance.now();
    const near =
        Math.abs(event.clientX - lastPress.x) <= PRESS_SLACK_PX &&
        Math.abs(event.clientY - lastPress.y) <= PRESS_SLACK_PX;
    const count = near && time - lastPress.time <= DOUBLE_PRESS_MILLIS ? lastPress.count + 1 : 1;
    lastPress = { time, x: event.clientX, y: event.clientY, count };
    return count;
}

/** Слово под точкой в текстовом слое, если она внутри слова.
 *
 * Якорь протяжки после двойного клика берётся по точке нажатия, а не из
 * выделения: WebKit применяет выбор блока раньше обработчика нажатия, и
 * выделение в документе к этому моменту уже растянуто на всю строку.
 */
function wordAtPoint(layer: Element, clientX: number, clientY: number): Range | null {
    const caretRangeFromPoint: ((x: number, y: number) => Range | null) | null =
        typeof document.caretRangeFromPoint === 'function'
            ? document.caretRangeFromPoint.bind(document)
            : typeof document.caretPositionFromPoint === 'function'
              ? (x: number, y: number) => {
                    const position = document.caretPositionFromPoint(x, y);
                    if (!position) {
                        return null;
                    }
                    const range = document.createRange();
                    range.setStart(position.offsetNode, position.offset);
                    range.setEnd(position.offsetNode, position.offset);
                    return range;
                }
              : null;
    const caret = caretRangeFromPoint ? caretRangeFromPoint(clientX, clientY) : null;
    const node = caret?.startContainer;
    if (!node || node.nodeType !== Node.TEXT_NODE || !layer.contains(node)) {
        return null;
    }
    const text = node as Text;
    const value = text.data;
    if (value.length === 0) {
        return null;
    }
    // Границы слова — пробелы и знаки препинания: двойной клик выделяет слово
    // без них, и якорь должен совпадать с тем, что видит пользователь.
    const isWordCharacter = (character: string): boolean => /[\p{L}\p{N}]/u.test(character);
    let start = Math.min(caret.startOffset, value.length - 1);
    let end = Math.min(caret.startOffset, value.length);
    if (!isWordCharacter(value[Math.max(0, Math.min(start, value.length - 1))])) {
        return null;
    }
    while (start > 0 && isWordCharacter(value[start - 1])) {
        start -= 1;
    }
    while (end < value.length && isWordCharacter(value[end])) {
        end += 1;
    }
    if (start === end) {
        return null;
    }
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, end);
    return range;
}

/** Начало протяжки выделения по указателю.
 *
 * Протяжка, начатая на слове текстового слоя, разрешает выделение только этому
 * слою; начатая вне текста — выключает нативное выделение совсем, поэтому
 * протяжка по канвасу растра или полю страницы ничего не выделяет.
 *
 * Нажатие, продолжающее двойной клик, запоминает слово под указателем якорем:
 * у движка это третье нажатие подряд, и он вёл бы выделение от начала строки.
 */
export function beginTextSelection(event: PointerEvent): void {
    const count = pressCount(event);
    endTextSelection();
    const layer = anchorOf(event.target);
    if (layer) {
        anchorLayer = layer;
        if (count > 1) {
            /* Якорь — слово, выделенное двойным кликом. Сначала берётся точка нажатия:
         она не зависит от порядка событий движка. Если каретки по точке нет,
         используется слово, запомненное в момент его выделения. Текущее
         выделение в этот момент уже может быть растянуто на строку. */
            anchorWord =
                wordAtPoint(layer, event.clientX, event.clientY) ??
                (lastDoubleClickedWord && layer.contains(lastDoubleClickedWord.startContainer)
                    ? lastDoubleClickedWord.cloneRange()
                    : null);
            anchorPress = { x: event.clientX, y: event.clientY };
        }
        mark(layer);
        return;
    }
    // Касанием прокручивают книгу, а средней кнопкой вставляют выделенное:
    // отмена такого нажатия сломала бы прокрутку и вставку.
    if (event.pointerType === 'touch' || event.button !== 0) {
        return;
    }
    event.preventDefault();
    clearSelection();
    mark(null);
}

/** Завершение протяжки выделения: ограничения снимаются. */
export function endTextSelection(): void {
    anchorLayer = null;
    anchorWord = null;
    anchorPress = null;
    anchorMoved = false;
    dragPoint = null;
    /* `lastDoubleClickedWord` здесь не сбрасывается: выделенное слово нужно
     следующему нажатию, которое продолжает двойной клик. */
    const root = document.documentElement;
    if (root.hasAttribute(TEXT_SELECTING_ATTR)) {
        root.removeAttribute(TEXT_SELECTING_ATTR);
    }
    for (const layer of document.querySelectorAll(`[${TEXT_ANCHOR_ATTR}]`)) {
        layer.removeAttribute(TEXT_ANCHOR_ATTR);
    }
}

/** Выделение от запомненного слова до каретки под указателем.
 *
 * Возвращает `null`, если якоря-слова нет: тогда выделение ведёт движок.
 * Каретка внутри слова оставляет слово целым: протяжка в его пределах ничего
 * не добавляет, а не отрезает от него первую букву.
 */
export function wordAnchoredRange(selection: Selection, anchor: Range): Range | null {
    const focusNode = selection.focusNode;
    if (!focusNode || !anchor.startContainer.isConnected) {
        return null;
    }
    const caret = document.createRange();
    try {
        caret.setStart(focusNode, selection.focusOffset);
    } catch (error) {
        return null;
    }
    const afterStart = caret.compareBoundaryPoints(Range.START_TO_START, anchor) >= 0;
    const beforeEnd = caret.compareBoundaryPoints(Range.END_TO_END, anchor) <= 0;
    if (afterStart && beforeEnd) {
        return anchor.cloneRange();
    }
    const range = document.createRange();
    try {
        if (afterStart) {
            range.setStart(anchor.startContainer, anchor.startOffset);
            range.setEnd(focusNode, selection.focusOffset);
        } else {
            range.setStart(focusNode, selection.focusOffset);
            range.setEnd(anchor.endContainer, anchor.endOffset);
        }
    } catch (error) {
        return null;
    }
    return range.collapsed ? null : range;
}

/** Ограничение идущего выделения слоем, на котором оно начато. */
export function clampTextSelection(): void {
    if (clamping) {
        return;
    }
    // Запоминание слова, выделенного двойным кликом, идёт до всех проверок: оно
    // нужно и вне протяжки, когда `anchorLayer` ещё не задан.
    rememberDoubleClickedWord();
    if (!anchorLayer) {
        return;
    }
    const selection = document.getSelection();
    if (!selection) {
        return;
    }
    /* Протяжку от якоря-слова ведёт `applyWordDrag`. Движок во время протяжки
     продолжает менять выделение по-своему (после двойного клика — от начала
     строки), а при движении вверх нередко сворачивает его в каретку. Поэтому
     диапазон восстанавливается по последней точке указателя до всех проверок
     текущего выделения — иначе восстанавливать было бы уже нечего. */
    if (anchorWord && anchorMoved && dragPoint) {
        applyWordDrag(dragPoint.x, dragPoint.y);
        return;
    }
    if (selection.rangeCount === 0 || selection.isCollapsed) {
        return;
    }
    const clamped = clampRange(selection.getRangeAt(0), anchorLayer);
    if (!clamped) {
        return;
    }
    clamping = true;
    try {
        selection.removeAllRanges();
        selection.addRange(clamped);
    } finally {
        clamping = false;
    }
}

/** Запоминание слова, которое движок выделил двойным кликом.
 *
 * Вызывается на каждое изменение выделения. Словом считается выделение без
 * пробелов внутри текстового слоя: так запоминается результат двойного клика, а
 * растянутая на строку область (выбор блока) не запоминается. Именно это слово
 * становится якорем протяжки, если движок испортил выделение до нажатия.
 */
function rememberDoubleClickedWord(): void {
    const selection = document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        return;
    }
    const range = selection.getRangeAt(0);
    const layer = elementOf(range.startContainer)?.closest(`.${TEXT_LAYER_CLASS}`);
    if (!layer || !layer.contains(range.endContainer)) {
        return;
    }
    if (range.toString().trim().length === 0 || /\s/.test(range.toString().trim())) {
        return;
    }
    lastDoubleClickedWord = range.cloneRange();
}

/** Отметка сдвига указателя после нажатия, продолжающего двойной клик.
 *
 * Вызывается при движении указателя: якорь-слово вступает в силу, только когда
 * протяжка действительно началась, но не раньше первого заметного сдвига.
 */
export function moveTextSelection(event: PointerEvent): void {
    if (!anchorPress || !anchorWord || !anchorLayer) {
        return;
    }
    if (!anchorMoved) {
        const dx = Math.abs(event.clientX - anchorPress.x);
        const dy = Math.abs(event.clientY - anchorPress.y);
        if (dx <= DRAG_THRESHOLD_PX && dy <= DRAG_THRESHOLD_PX) {
            return;
        }
        anchorMoved = true;
    }
    dragPoint = { x: event.clientX, y: event.clientY };
    applyWordDrag(event.clientX, event.clientY);
}

/** Ведение выделения от якоря-слова до каретки под указателем.
 *
 * Выделение строится здесь, а не отдаётся движку: после двойного клика он
 * трактует продолжение как выбор блока и тянет диапазон от начала строки.
 * Позиция конца берётся по точке указателя, поэтому порядок событий движка и
 * его собственное выделение на результат не влияют.
 */
function applyWordDrag(clientX: number, clientY: number): void {
    const anchor = anchorWord;
    const layer = anchorLayer;
    if (!anchor || !layer) {
        return;
    }
    const caret = caretAtPoint(clientX, clientY);
    if (!caret || !layer.contains(caret.startContainer)) {
        return;
    }
    const selection = document.getSelection();
    if (!selection) {
        return;
    }
    const range = document.createRange();
    try {
        if (caret.compareBoundaryPoints(Range.START_TO_START, anchor) >= 0) {
            range.setStart(anchor.startContainer, anchor.startOffset);
            range.setEnd(caret.startContainer, caret.startOffset);
        } else {
            /* Протяжка вверх: конец — начало слова, начало — каретка. Сравнивать
         нужно с началом слова, а не с концом: каретка выше якоря всегда левее
         его начала. */
            range.setStart(caret.startContainer, caret.startOffset);
            range.setEnd(anchor.startContainer, anchor.startOffset);
        }
    } catch (error) {
        return;
    }
    clamping = true;
    try {
        selection.removeAllRanges();
        selection.addRange(range);
    } finally {
        clamping = false;
    }
}

/** Каретка в текстовом слое по координатам указателя. */
function caretAtPoint(clientX: number, clientY: number): Range | null {
    const create = (x: number, y: number): Range | null => {
        if (typeof document.caretRangeFromPoint === 'function') {
            return document.caretRangeFromPoint(x, y);
        }
        if (typeof document.caretPositionFromPoint === 'function') {
            const position = document.caretPositionFromPoint(x, y);
            if (!position) {
                return null;
            }
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.setEnd(position.offsetNode, position.offset);
            return range;
        }
        return null;
    };
    const range = create(clientX, clientY);
    if (!range) {
        return null;
    }
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) {
        return null;
    }
    // Каретка ставится за пределами текста — конец диапазона всё равно нужен:
    // он упирается в крайнюю позицию узла, и выделение доходит до края страницы.
    return range;
}
