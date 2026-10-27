/** Сноска книги: распознавание по разметке, содержимое меню и ссылки возврата.
 *
 * Модуль чист от Svelte. Сноска отличается от обычной внутренней ссылки не
 * номером главы, а самой разметкой книги. Книги размечают сноски по-разному:
 * FB2 — классом `fb2-note` и телом `fb2-notes`, EPUB — `epub:type` и ролями
 * ARIA, а чаще всего вообще никак: сноска — это пара обычных ссылок «туда и
 * обратно» (маркер в тексте и возврат в тексте сноски). Поэтому признаков
 * несколько, и любого достаточно.
 *
 * Возврат к месту ссылки живёт в самом тексте сноски: если издатель его не
 * поставил, читалка добавляет ссылку «↩» на маркер. Так возврат есть у всех
 * сносок, а не только у той, по которой только что кликнули.
 */

import { anchorTarget, parseBookLink } from './book-link';

/** Класс тела сносок FB2. */
export const FB2_NOTES_CLASS = 'fb2-notes';

/** Класс ссылки возврата к месту ссылки, добавленной читалкой. */
export const FOOTNOTE_BACK_CLASS = 'context-footnote-back';

/** Атрибут маркера, к которому ведёт добавленная ссылка возврата. */
export const FOOTNOTE_SOURCE_ATTR = 'data-context-noteref';

/** Найденная сноска книги. */
export interface BookFootnote {
    /** Идентификатор якоря цели (без `#`). */
    anchor: string;
    /** Элемент сноски в документе книги (не всей области сносок). */
    target: HTMLElement;
}

/** Признак ссылки-маркера сноски в разметке книги. */
function isFootnoteSource(element: Element): boolean {
    if (element.classList.contains('fb2-note')) {
        return true;
    }
    if (element.hasAttribute(FOOTNOTE_SOURCE_ATTR)) {
        return true;
    }
    const type = element.getAttribute('epub:type') ?? '';
    if (/(^|\s)noteref(\s|$)/.test(type)) {
        return true;
    }
    return element.getAttribute('role') === 'doc-noteref';
}

/** Признак ссылки на отдельный файл сносок.
 *
 * Издатели EPUB часто не размечают ни ссылку, ни цель, но выносят сноски в файл
 * `notes.xhtml` / `footnotes.xhtml` и ссылаются на него с якорем. Такой ссылки
 * достаточно, чтобы показать сноску в меню.
 */
function isFootnoteHref(href: string): boolean {
    const file = href.split('#')[0] ?? '';
    if (!file) {
        return false;
    }
    return /(^|[\\/_.-])(notes?|footnotes?|endnotes?)([\\/_.-]|$)/i.test(file);
}

/** Признак группы сносок: тело FB2, `footnotes`/`endnotes` или роль группы. */
function isFootnoteGroup(element: Element): boolean {
    if (element.classList.contains(FB2_NOTES_CLASS)) {
        return true;
    }
    const type = element.getAttribute('epub:type') ?? '';
    if (/(^|\s)(footnotes|endnotes)(\s|$)/.test(type)) {
        return true;
    }
    const role = element.getAttribute('role') ?? '';
    return role === 'doc-footnotes' || role === 'doc-endnotes';
}

/** Признак одной сноски: `footnote`/`endnote`, роль или класс сноски. */
function isFootnoteElement(element: Element): boolean {
    if (isFootnoteGroup(element)) {
        return false;
    }
    const type = element.getAttribute('epub:type') ?? '';
    if (/(^|\s)(footnote|endnote)(\s|$)/.test(type)) {
        return true;
    }
    const role = element.getAttribute('role') ?? '';
    if (role === 'doc-footnote' || role === 'doc-endnote') {
        return true;
    }
    // Разметка без `epub:type`: издатели помечают сноску классом.
    return /(^|[\s_-])(footnote|endnote)([\s_-]|$)/i.test(
        typeof element.className === 'string' ? element.className : '',
    );
}

/** Элемент одной сноски внутри области сносок.
 *
 * Группа (тело FB2, `epub:type="endnotes"`) даёт слишком большой текст для меню,
 * поэтому внутри неё берётся элемент с идентификатором — тот, на который
 * указывает ссылка; если идентификатора нет, остаётся верхнеуровневый элемент
 * группы.
 */
function footnoteBlock(target: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = target;
    let group: HTMLElement | null = null;
    while (current) {
        if (isFootnoteElement(current)) {
            return current;
        }
        if (isFootnoteGroup(current)) {
            group = current;
            break;
        }
        current = current.parentElement;
    }
    if (!group) {
        return null;
    }
    // Ближайший к цели элемент с идентификатором: это и есть одна сноска.
    let identified: HTMLElement | null = target;
    while (identified && identified !== group) {
        if (identified.id) {
            return identified;
        }
        identified = identified.parentElement;
    }
    let top: HTMLElement | null = target;
    while (top?.parentElement && top.parentElement !== group) {
        top = top.parentElement;
    }
    return top === group ? null : top;
}

/** Ближайший к цели элемент с идентификатором. */
function identifiedAncestor(target: HTMLElement): HTMLElement {
    let current: HTMLElement | null = target;
    while (current) {
        if (current.id) {
            return current;
        }
        current = current.parentElement;
    }
    return target;
}

/** Есть ли у элемента собственный текст. */
function hasText(element: Element): boolean {
    return Boolean(element.textContent?.trim());
}

/** Блочные элементы, в которых живёт текст сноски. */
const BLOCK_SELECTOR = 'p,li,dd,dt,blockquote,aside,section,article,div,td,th,figure';

/** Единица текста сноски для книг без разметки области.
 *
 * Цель ссылки почти всегда — встроенная метка: `<a id="n1">↩</a>`,
 * `<a id="fn-1"></a>` или `<sup>1</sup>`. Текст сноски живёт вокруг неё, в
 * ближайшем блочном элементе. Подниматься выше нельзя: там уже контейнер со
 * всеми сносками книги, и меню показало бы их все сразу.
 */
function noteUnit(raw: HTMLElement): HTMLElement {
    const tag = raw.tagName;
    const inline = ['A', 'SPAN', 'SUP', 'SUB', 'EM', 'STRONG', 'I', 'B', 'SMALL'].includes(tag);
    if (!inline) {
        return raw;
    }
    const block = raw.closest(BLOCK_SELECTOR) as HTMLElement | null;
    if (block && block.tagName !== 'BODY') {
        return block;
    }
    return raw;
}

/** Внутренние ссылки книги внутри элемента. */
function innerLinks(element: Element): HTMLAnchorElement[] {
    return Array.from(element.querySelectorAll('a[href]')) as HTMLAnchorElement[];
}

/** Признак пары «маркер ↔ сноска» по обратной ссылке.
 *
 * В книгах без разметки сноска узнаётся по тому, что из её текста ведёт ссылка
 * назад к маркеру: отдельной ссылкой «↩» или цифрой. Если такая ссылка в блоке
 * цели указывает на сам маркер (или на элемент, его содержащий), цель — сноска.
 */
function isReturnPair(link: HTMLAnchorElement, target: HTMLElement, doc: Document): boolean {
    const scope = identifiedAncestor(target);
    for (const candidate of innerLinks(scope)) {
        if (candidate === link) {
            continue;
        }
        const parsed = parseBookLink(candidate.getAttribute('href'));
        if (parsed.kind !== 'anchor' || !parsed.anchor) {
            continue;
        }
        const goal = anchorTarget(doc, parsed.anchor);
        if (goal && (goal === link || goal.contains(link) || link.contains(goal))) {
            return true;
        }
    }
    return false;
}

/** Признак якоря сноски по имени: `n1`, `fn1`, `note1`, `footnote1`. */
function isFootnoteAnchor(anchor: string): boolean {
    return /^(n|fn|fnt|note|footnote|endnote|fnref|noteref)[-_.]?\d+$/i.test(anchor.trim());
}

/** Признак цифрового маркера: `1`, `[1]`, `<sup>1</sup>`. */
function isNumericMarker(link: Element): boolean {
    const text = (link.textContent ?? '').trim();
    return /^\[?\d{1,3}\]?$/.test(text);
}

/** Сноска по ссылке книги или `null`, если ссылка обычная.
 *
 * Признаки проверяются от сильного к слабому: область сносок вокруг цели,
 * пометка самой ссылки, обратная ссылка из цели, имя якоря с цифровым маркером.
 * Обычная ссылка на раздел книги остаётся обычной: у неё нет ни одного признака.
 *
 * Ссылка возврата (из текста сноски назад к маркеру) сноской не считается: её
 * цель стоит в документе раньше самой ссылки, и переход по ней просто
 * прокручивает книгу.
 */
export function bookFootnote(link: Element, doc: Document): BookFootnote | null {
    const href = link.getAttribute('href') ?? '';
    const parsed = parseBookLink(href);
    if (parsed.kind !== 'anchor' || !parsed.anchor) {
        return null;
    }
    // Ссылка внутри самой сноски — это возврат к тексту (у издателя или наш), а
    // не маркер.
    if (footnoteBlock(link as HTMLElement)) {
        return null;
    }
    const raw = anchorTarget(doc, parsed.anchor);
    if (!raw) {
        return null;
    }
    // Цель раньше ссылки — это возврат назад, а не сноска.
    if (link.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_PRECEDING) {
        return null;
    }
    const unit = noteUnit(raw);
    const block = footnoteBlock(unit) ?? footnoteBlock(raw);
    if (block) {
        return { anchor: parsed.anchor, target: noteUnit(block) };
    }
    if (isFootnoteSource(link) || isFootnoteHref(href)) {
        return { anchor: parsed.anchor, target: unit };
    }
    if (isReturnPair(link as HTMLAnchorElement, unit, doc)) {
        return { anchor: parsed.anchor, target: unit };
    }
    if (isFootnoteAnchor(parsed.anchor) && isNumericMarker(link)) {
        return { anchor: parsed.anchor, target: unit };
    }
    return null;
}

/** Теги, содержимое которых в меню не нужно и небезопасно. */
const DROPPED_TAGS = new Set([
    'script',
    'style',
    'link',
    'iframe',
    'object',
    'embed',
    'form',
    'input',
    'button',
    'textarea',
    'select',
]);

/** Разрешённый адрес изображения сноски: только встроенные данные. */
function isSafeImageSource(value: string): boolean {
    return /^data:image\//i.test(value.trim());
}

/** Очистка клона цели сноски от опасной и лишней разметки. */
function sanitize(clone: Element): void {
    for (const element of Array.from(clone.querySelectorAll('*'))) {
        // Ссылка возврата принадлежит документу книги: в меню она не нужна.
        if (element.classList.contains(FOOTNOTE_BACK_CLASS)) {
            element.remove();
            continue;
        }
        if (DROPPED_TAGS.has(element.tagName.toLowerCase())) {
            element.remove();
            continue;
        }
        for (const attribute of Array.from(element.attributes)) {
            const name = attribute.name.toLowerCase();
            // Ссылки сноски остаются текстом: переход по ним ломал бы область чтения.
            if (name === 'href') {
                element.removeAttribute(attribute.name);
                continue;
            }
            // Обработчики событий и адреса вне встроенных данных не переносятся в
            // документ оболочки.
            if (
                name.startsWith('on') ||
                ((name === 'src' || name === 'srcset') && !isSafeImageSource(attribute.value))
            ) {
                element.removeAttribute(attribute.name);
            }
        }
    }
}

/** HTML содержимого сноски для меню оболочки.
 *
 * Берётся копия цели: документ книги не меняется, а в меню попадает текст в
 * разметке книги без скриптов, обработчиков и внешних ресурсов.
 */
export function footnoteContentHtml(target: HTMLElement): string {
    const clone = target.cloneNode(true) as HTMLElement;
    sanitize(clone);
    return clone.innerHTML;
}

/** Ссылка возврата к маркеру сноски в разметке книги. */
function backLink(doc: Document, sourceId: string): HTMLAnchorElement {
    const link = doc.createElement('a');
    link.className = FOOTNOTE_BACK_CLASS;
    link.setAttribute('href', `#${sourceId}`);
    link.setAttribute('title', 'Вернуться к месту ссылки');
    link.textContent = '↩';
    return link;
}

/** Идентификатор маркера для ссылки возврата.
 *
 * У маркера книги идентификатора обычно нет, поэтому он выдаётся читалкой:
 * прежний идентификатор сохраняется, если он есть.
 */
function sourceId(doc: Document, link: HTMLAnchorElement, anchor: string): string {
    if (link.id) {
        return link.id;
    }
    const base = `context-noteref-${anchor}`;
    let id = base;
    let index = 1;
    while (doc.getElementById(id)) {
        index += 1;
        id = `${base}-${index}`;
    }
    link.id = id;
    link.setAttribute(FOOTNOTE_SOURCE_ATTR, '');
    return id;
}

/** Признак того, что у сноски уже есть своя ссылка возврата от издателя. */
function hasOwnReturn(target: HTMLElement, doc: Document): boolean {
    for (const element of innerLinks(target)) {
        const parsed = parseBookLink(element.getAttribute('href'));
        if (parsed.kind !== 'anchor' || !parsed.anchor) {
            continue;
        }
        const goal = anchorTarget(doc, parsed.anchor);
        // Ссылка на обычный текст книги — это и есть издательский возврат.
        if (goal && !goal.closest(`.${FB2_NOTES_CLASS}`) && !isFootnoteElement(goal)) {
            return true;
        }
    }
    return false;
}

/** Добавление ссылок возврата ко всем сноскам документа книги.
 *
 * Читается каждая внутренняя ссылка книги: если её цель оказалась сноской, к
 * сноске добавляется ссылка «↩» на маркер. Маркер получает идентификатор, если
 * его не было. Если издатель уже поставил в сноске свою ссылку возврата, вторая
 * не добавляется. Повторный вызов (например, после возврата книги на место) уже
 * добавленных ссылок не дублирует.
 *
 * Возвращает число добавленных ссылок.
 */
export function installFootnoteReturns(doc: Document): number {
    const seen = new Set<HTMLElement>();
    let count = 0;
    for (const link of Array.from(doc.querySelectorAll('a[href]')) as HTMLAnchorElement[]) {
        if (link.classList.contains(FOOTNOTE_BACK_CLASS)) {
            continue;
        }
        const footnote = bookFootnote(link, doc);
        if (!footnote || seen.has(footnote.target)) {
            continue;
        }
        seen.add(footnote.target);
        if (footnote.target.querySelector(`.${FOOTNOTE_BACK_CLASS}`)) {
            continue;
        }
        if (hasOwnReturn(footnote.target, doc)) {
            continue;
        }
        footnote.target.append(backLink(doc, sourceId(doc, link, footnote.anchor)));
        count += 1;
    }
    return count;
}
