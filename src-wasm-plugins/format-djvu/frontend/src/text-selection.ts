/** Ограничение живого выделения текстовым слоем страницы.
 *
 * Браузер достраивает выделение от ближайшего текста до указателя, поэтому
 * протяжка, начатая в поле страницы (мимо слова, между строками, по канвасу
 * растра) или уведённая за страницу, давала выделение всего документа — как
 * область, а не как текст. Поэтому свободная протяжка ведётся целиком вьюером:
 * якорь — каретка нажатия, конец — каретка по геометрии слоя, нативное
 * выделение не запускается вовсе. Для точки в промежутке между строками или в
 * поле страницы берётся край ближайшей строки, а не край ближайшего текста.
 *
 * Отдельный случай — протяжка, начатая повторным нажатием после двойного клика.
 * Для движка это уже третье нажатие подряд, то есть выбор блока: якорем
 * становится начало инлайн-куска слоя (в слое DjVu кусок — слово), и выделение
 * тянется от её начала, а не от выделенного слова. Поэтому выделенное слово
 * запоминается при нажатии и остаётся якорем протяжки: конец ведётся за
 * указателем целыми словами, а прежнее выделение не расширяется вверх.
 */
import { TEXT_LAYER_CLASS, elementOf } from './dom';
import { layerCaretAtPoint, lineEdgeCaretAtPoint, lineRangeAtPoint } from './carets';

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

/** Каретка нажатия при свободной протяжке: начало выделения. */
let anchorCaret: { node: Text; offset: number } | null = null;

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

/** Слово под точкой в текстовом слое.
 *
 * Якорь протяжки после двойного клика берётся по точке нажатия, а не из
 * выделения: WebKit применяет выбор блока раньше обработчика нажатия, и
 * выделение в документе к этому моменту уже растянуто на всю строку.
 *
 * Каретка по точке встаёт на границу слов — на пробел или сразу за последней
 * буквой. Якорь не теряется: берётся ближайшее к каретке слово, а при равенстве
 * зазоров — то, что левее (в него целятся двойным кликом чаще).
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
    // Границы слова — не буквы и не цифры: двойной клик выделяет слово без
    // пробелов и знаков препинания, и якорь должен совпадать с тем, что видит
    // пользователь.
    const isWordCharacter = (character: string): boolean => /[\p{L}\p{N}]/u.test(character);
    const wordRangeAt = (index: number): Range | null => {
        if (index < 0 || index >= value.length) {
            return null;
        }
        let start = index;
        let end = index + 1;
        while (start > 0 && isWordCharacter(value[start - 1])) {
            start -= 1;
        }
        while (end < value.length && isWordCharacter(value[end])) {
            end += 1;
        }
        if (!isWordCharacter(value[index]) || start === end) {
            return null;
        }
        const range = document.createRange();
        range.setStart(text, start);
        range.setEnd(text, end);
        return range;
    };
    return wordRangeAt(caret.startOffset) ?? wordRangeAt(caret.startOffset - 1);
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
        /* Точка нажатия нужна на любом нажатии: по ней отличается клик от
           протяжки. */
        anchorPress = { x: event.clientX, y: event.clientY };
        /* Нативное выделение не запускается ни на одном нажатии: выделение
           целиком ведёт вьюер. В WebKit его запускает `mousedown`, а не
           `pointerdown`, и на слое, где начата протяжка, оно разрешалось
           правилом `user-select` — движок тянул своё выделение поверх нашего.
           Отсюда рывки: на шаге в пустоте его выделение пропадало, а на
           следующем шаге захватывало весь документ. */
        if (event.pointerType !== 'touch') {
            event.preventDefault();
            /* Отмена нажатия отбирает и переход фокуса в область книги, а без
               фокуса не работают клавиши: Ctrl+A выделял текст страницы
               документа, а не книги. Фокус ставится вручную — как это делало
               само нажатие. */
            window.focus();
            /* Прежнее выделение снимается нажатием, как это делал движок:
               иначе меню прошлой цитаты оставалось бы висеть. */
            clearSelection();
        }
        if (count === 1) {
            /* Свободная протяжка: якорь — каретка нажатия, дальше конец
               считается по геометрии слоя. Браузер для точки в промежутке между
               строками достраивал диапазон до края ближайшего текста, и начало
               выделения уезжало на слово выше. */
            anchorCaret = layerCaretAtPoint(layer, event.clientX, event.clientY);
        } else {
            /* Повторное нажатие выделяет слово, третье — строку. Движок этого
               уже не сделает: нажатие отменено. Якорь протяжки — слово:
               протяжка от двойного клика растёт целыми словами, а не от начала
               строки, иначе первый же шаг захватывал бы её целиком. */
            const word = wordAtPoint(layer, event.clientX, event.clientY);
            if (word) {
                anchorWord = word;
            }
            if (count > 2) {
                const line = lineRangeAtPoint(layer, event.clientY);
                if (line) {
                    selectRange(line);
                }
            } else if (word) {
                selectRange(word);
            }
        }
        return;
    }
    // Касанием прокручивают книгу, а средней кнопкой вставляют выделенное:
    // отмена такого нажатия сломала бы прокрутку и вставку.
    if (event.pointerType === 'touch' || event.button !== 0) {
        return;
    }
    event.preventDefault();
    clearSelection();
}

/** Завершение протяжки выделения: ограничения снимаются. */
export function endTextSelection(): void {
    anchorLayer = null;
    anchorWord = null;
    anchorCaret = null;
    anchorPress = null;
    anchorMoved = false;
    dragPoint = null;
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

/** Отметка сдвига указателя после нажатия, продолжающего двойной клик.
 *
 * Вызывается при движении указателя: якорь-слово вступает в силу, только когда
 * протяжка действительно началась, но не раньше первого заметного сдвига.
 */
export function moveTextSelection(event: PointerEvent): void {
    if (!anchorPress || !anchorLayer) {
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
    if (anchorWord) {
        applyWordDrag(event.clientX, event.clientY);
        return;
    }
    applyFreeDrag(event.clientX, event.clientY);
}

/** Ведение свободной протяжки: от каретки нажатия до точки под указателем.
 *
 * Выделение строится вьюером по геометрии текстового слоя, а не отдаётся
 * браузеру: для точки в промежутке между строками или в поле страницы он
 * достраивал диапазон до края ближайшего текста, и начало выделения уезжало на
 * слово выше, а конец — к началу страницы. Строка выбирается по вертикали,
 * позиция внутри неё — по горизонтали. Конец посимвольный: так работает
 * обычная протяжка по тексту.
 */
function applyFreeDrag(clientX: number, clientY: number): void {
    const anchor = anchorCaret;
    const layer = anchorLayer;
    if (!anchor || !layer) {
        return;
    }
    const caret = lineCaretAtPoint(layer, clientX, clientY, dragForward(anchor, clientY));
    if (!caret) {
        return;
    }
    applySelectionRange(anchor, caret);
}

/** Ведение выделения от якоря-слова до каретки под указателем.
 *
 * Выделение строится здесь, а не отдаётся движку: после двойного клика он
 * трактует продолжение как выбор блока и тянет диапазон от начала строки.
 * Позиция конца берётся по точке указателя, поэтому порядок событий движка и
 * его собственное выделение на результат не влияют.
 *
 * Конец привязывается к границе слова: протяжка от двойного клика выделяет
 * словами, а не по буквам — в этом её отличие от обычной протяжки. Слово
 * берётся со стороны протяжки, поэтому выделение растёт целыми словами и вниз,
 * и вверх.
 */
function applyWordDrag(clientX: number, clientY: number): void {
    const anchor = anchorWord;
    const layer = anchorLayer;
    if (!anchor || !layer) {
        return;
    }
    const start = { node: anchor.startContainer as Text, offset: anchor.startOffset };
    const caret = lineCaretAtPoint(layer, clientX, clientY, dragForward(start, clientY));
    if (!caret || !layer.contains(caret.node)) {
        return;
    }
    const forward = caretAfter(caret, start, dragForward(start, clientY));
    const end = wordEdge(caret, start, forward);
    applySelectionRange(start, end, anchor.endContainer as Text, anchor.endOffset);
}

/** Идёт ли конец выделения вперёд относительно якоря.
 *
 * Порядок концов определяется их местом в тексте, а не только вертикалью:
 * протяжка влево по той же строке тоже расширяет выделение назад, и слово
 * берётся со стороны протяжки. Вертикаль нужна лишь когда позиции совпали
 * (точка нажатия и конца в одном месте текста).
 */
function caretAfter(
    caret: { node: Text; offset: number },
    anchor: { node: Text; offset: number },
    vertical: boolean,
): boolean {
    if (caret.node === anchor.node) {
        if (caret.offset !== anchor.offset) {
            return caret.offset > anchor.offset;
        }
        return vertical;
    }
    const range = document.createRange();
    try {
        range.setStart(anchor.node, anchor.offset);
        range.setEnd(caret.node, caret.offset);
        return range.startContainer !== caret.node || range.startOffset !== caret.offset;
    } catch (error) {
        return vertical;
    }
}

/** Граница слова у позиции каретки со стороны протяжки.
 *
 * Позиция внутри слова не режет его: конец уходит к концу слова при движении
 * вперёд и к его началу при движении назад. Если каретка стоит на пробеле или
 * за пределами текста, берётся край ближайшего слова, а при его отсутствии —
 * позиция каретки без изменений.
 */
function wordEdge(
    caret: { node: Text; offset: number },
    anchor: { node: Text; offset: number },
    forward: boolean,
): { node: Text; offset: number } {
    const value = caret.node.data;
    const isWordCharacter = (character: string | undefined): boolean =>
        character !== undefined && /[\p{L}\p{N}]/u.test(character);
    let index = Math.max(0, Math.min(caret.offset, value.length));
    // Каретка сразу за словом — это его конец; на пустом месте — ищем рядом.
    if (!isWordCharacter(value[index])) {
        if (isWordCharacter(value[index - 1])) {
            index -= 1;
        } else if (isWordCharacter(value[index + 1])) {
            index += 1;
        } else {
            return caret;
        }
    }
    let start = index;
    let end = index + 1;
    while (start > 0 && isWordCharacter(value[start - 1])) {
        start -= 1;
    }
    while (end < value.length && isWordCharacter(value[end])) {
        end += 1;
    }
    const wordStart = { node: caret.node, offset: start };
    const wordEnd = { node: caret.node, offset: end };
    /* Слово-якорь не обрезается: если каретка внутри него, конец остаётся у той
       стороны, где она стоит, а начало выделения — у якоря. */
    const insideAnchor =
        anchor.node === caret.node && anchor.offset >= start && anchor.offset <= end;
    if (insideAnchor) {
        return anchor.offset <= index ? wordEnd : wordStart;
    }
    return forward ? wordEnd : wordStart;
}

/** Применение готового диапазона как текущего выделения. */
function selectRange(range: Range): void {
    const selection = document.getSelection();
    if (!selection || range.collapsed) {
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

/** Применение выделения от начала до конца с учётом их порядка.
 *
 * `endNode`/`endOffset` задают конец, когда протяжка идёт вверх: тогда концом
 * выделения становится не позиция нажатия, а конец слова-якоря.
 */
function applySelectionRange(
    anchor: { node: Text; offset: number },
    caret: { node: Text; offset: number },
    endNode?: Text,
    endOffset?: number,
): void {
    const selection = document.getSelection();
    if (!selection) {
        return;
    }
    const range = document.createRange();
    const caretRange = document.createRange();
    try {
        caretRange.setStart(caret.node, caret.offset);
        caretRange.setEnd(caret.node, caret.offset);
        const anchorRange = document.createRange();
        anchorRange.setStart(anchor.node, anchor.offset);
        anchorRange.setEnd(anchor.node, anchor.offset);
        if (caretRange.compareBoundaryPoints(Range.START_TO_START, anchorRange) >= 0) {
            range.setStart(anchor.node, anchor.offset);
            range.setEnd(caret.node, caret.offset);
        } else {
            range.setStart(caret.node, caret.offset);
            if (endNode && endOffset !== undefined) {
                range.setEnd(endNode, endOffset);
            } else {
                range.setEnd(anchor.node, anchor.offset);
            }
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

/** Направление протяжки от точки нажатия по вертикали.
 *
 * В промежутке между строками зазор до соседних строк одинаков, и без
 * направления конец откатывался бы к строке с нажатием: выделение «залипало».
 */
function dragForward(anchor: { node: Text; offset: number }, clientY: number): boolean {
    const bounds = elementOf(anchor.node)?.getBoundingClientRect();
    return bounds ? clientY > bounds.top + bounds.height / 2 : true;
}

/** Положение каретки под указателем.
 *
 * Внутри строки и в промежутке между строками позиция ведётся по геометрии:
 * строка выбирается по вертикали, позиция в ней — по горизонтали. Раньше в
 * промежутке брался край строки, и выделение каждый раз прыгало на всю строку и
 * обратно — стоило указателю попасть в щель между строками.
 *
 * В промежутке между строками зазор до соседних одинаков, и строка берётся со
 * стороны протяжки (`forward`). Край текста нужен только за пределами блока:
 * выше первой строки выделение доводится до её начала, ниже последней — до конца.
 */
function lineCaretAtPoint(
    layer: Element,
    clientX: number,
    clientY: number,
    forward: boolean,
): { node: Text; offset: number } | null {
    const caret = layerCaretAtPoint(layer, clientX, clientY, forward);
    if (!caret) {
        return null;
    }
    if (caret.inside) {
        return { node: caret.node, offset: caret.offset };
    }
    return (
        lineEdgeCaretAtPoint(layer, clientY) ?? {
            node: caret.node,
            offset: caret.offset,
        }
    );
}
