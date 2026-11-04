/** Поиск по тексту книги во встроенном чтении.
 *
 * Модуль чист от Svelte: получает разделы глав документа книги, находит
 * вхождения запроса и отдаёт их места в смещениях символов главы — тех же, что
 * у якорей заметок. Подсветка найденного живёт отдельно (`search-mark.ts`),
 * потому что она меняет документ книги.
 *
 * Поиск не зависит от разметки: сравнение идёт по непрерывному тексту главы,
 * а серии пробельных символов считаются одним пробелом. Поэтому запрос из
 * нескольких слов находится и тогда, когда слова разделены переносом строки
 * или вложенной разметкой.
 *
 * Текст главы нормализуется один раз на главу и переиспользуется при наборе
 * запроса: иначе каждая буква пересобирала бы карту смещений всей книги.
 */

/** Предел числа вхождений, по которым можно переходить.
 *
 * Очень частый запрос (одна буква) даёт десятки тысяч вхождений: строить и
 * подсвечивать их все — заметная работа без пользы. Сверх предела вхождения
 * не собираются, но `truncated` сообщает, что найдено больше.
 */
export const SEARCH_LIMIT = 500;

/** Вхождение запроса в тексте книги. */
export interface SearchHit {
    /** Индекс главы книги. */
    chapter: number;
    /** Смещение начала в символах внутри главы. */
    start: number;
    /** Смещение конца в символах внутри главы. */
    end: number;
    /** Фрагмент текста вокруг вхождения для показа в панели. */
    preview: string;
}

/** Результат поиска по книге. */
export interface SearchResult {
    /** Найденные вхождения в порядке чтения. */
    hits: SearchHit[];
    /** Совпали ли все вхождения из книги. */
    truncated: boolean;
}

/** Длина фрагмента вокруг вхождения с каждой стороны, в символах. */
const PREVIEW_RADIUS = 60;

/** Текст, приведённый к сравнимому виду, и карта его символов в исходный текст. */
interface NormalizedText {
    /** Текст без лишних пробелов, в нижнем регистре. */
    text: string;
    /** Для каждого символа `text` — индекс исходного символа. */
    offsets: number[];
}

/** Нормализованный текст главы с исходником, по которому он построен. */
interface NormalizedChapter extends NormalizedText {
    /** Исходный текст главы на момент нормализации. */
    raw: string;
}

/** Кэш нормализованного текста глав: набор запроса не пересобирает книгу.
 *
 * Ключ — раздел главы, поэтому кэш живёт вместе с документом книги. Подсветка
 * найденного заворачивает текст в `<mark>`, но текста не меняет, поэтому
 * исходник остаётся прежним и кэш не пересобирается.
 */
const normalizedChapters = new WeakMap<Element, NormalizedChapter>();

/** Приведение текста к виду для сравнения с сохранением карты смещений.
 *
 * Серии пробельных символов становятся одним пробелом (и отбрасываются по
 * краям), символы приводятся к нижнему регистру. Карта позволяет перевести
 * найденное место обратно в смещения текста главы, по которым работает
 * подсветка.
 */
function normalizeWithOffsets(raw: string): NormalizedText {
    let text = '';
    const offsets: number[] = [];
    let pendingSpace = false;
    for (let index = 0; index < raw.length; index += 1) {
        const character = raw[index];
        if (/\s/.test(character)) {
            pendingSpace = text.length > 0;
            continue;
        }
        if (pendingSpace) {
            text += ' ';
            offsets.push(index);
            pendingSpace = false;
        }
        const lower = character.toLowerCase();
        for (let shift = 0; shift < lower.length; shift += 1) {
            text += lower[shift];
            offsets.push(index);
        }
    }
    return { text, offsets };
}

/** Нормализованный текст главы (по кэшу, если глава не менялась). */
function normalizedChapter(chapter: Element, raw: string): NormalizedChapter {
    const cached = normalizedChapters.get(chapter);
    if (cached && cached.raw === raw) {
        return cached;
    }
    const value: NormalizedChapter = { raw, ...normalizeWithOffsets(raw) };
    normalizedChapters.set(chapter, value);
    return value;
}

/** Приведение запроса к виду для сравнения. */
export function normalizeQuery(query: string): string {
    return normalizeWithOffsets(query).text;
}

/** Фрагмент вокруг вхождения: пробелы сжаты, края помечены многоточием. */
function previewOf(raw: string, start: number, end: number): string {
    const from = Math.max(0, start - PREVIEW_RADIUS);
    const to = Math.min(raw.length, end + PREVIEW_RADIUS);
    const text = raw.slice(from, to).replace(/\s+/g, ' ').trim();
    return `${from > 0 ? '…' : ''}${text}${to < raw.length ? '…' : ''}`;
}

/** Все вхождения запроса в приведённом тексте (индексы начал). */
function occurrences(text: string, needle: string): number[] {
    const found: number[] = [];
    if (!needle) {
        return found;
    }
    let from = 0;
    for (;;) {
        const at = text.indexOf(needle, from);
        if (at < 0) {
            return found;
        }
        found.push(at);
        from = at + Math.max(1, needle.length);
    }
}

/** Вхождения в приведённом тексте главы с переводом в её смещения. */
function hitsOfNormalized(
    normalized: NormalizedText,
    raw: string,
    needle: string,
    chapter: number,
    limit: number,
): { hits: SearchHit[]; truncated: boolean } {
    const hits: SearchHit[] = [];
    if (!needle || limit <= 0) {
        return { hits, truncated: false };
    }
    const { text, offsets } = normalized;
    let truncated = false;
    for (const at of occurrences(text, needle)) {
        if (hits.length >= limit) {
            truncated = true;
            break;
        }
        const start = offsets[at] ?? 0;
        const last = offsets[Math.min(at + needle.length - 1, offsets.length - 1)] ?? start;
        const end = last + 1;
        hits.push({ chapter, start, end, preview: previewOf(raw, start, end) });
    }
    return { hits, truncated };
}

/** Поиск по тексту одной главы.
 *
 * `raw` берётся готовым (см. `chapterTextOf`), чтобы повторный поиск не
 * пересобирал текст главы на каждый запрос.
 */
export function searchChapterText(
    raw: string,
    query: string,
    chapter: number,
    limit: number = SEARCH_LIMIT,
): { hits: SearchHit[]; truncated: boolean } {
    const needle = normalizeQuery(query);
    if (!needle || limit <= 0) {
        return { hits: [], truncated: false };
    }
    return hitsOfNormalized(normalizeWithOffsets(raw), raw, needle, chapter, limit);
}

/** Поиск по разделам глав документа книги.
 *
 * `chapters` — разделы глав в порядке чтения и функция их текста: текст
 * кэшируется вызывающей стороной, поэтому поиск не пересобирает книгу.
 */
export function searchBook(
    chapters: Element[],
    query: string,
    textOf: (chapter: Element) => string | null,
    limit: number = SEARCH_LIMIT,
): SearchResult {
    const needle = normalizeQuery(query);
    const hits: SearchHit[] = [];
    let truncated = false;
    if (!needle) {
        return { hits, truncated };
    }
    for (const chapter of chapters) {
        if (hits.length >= limit) {
            truncated = true;
            break;
        }
        const raw = textOf(chapter);
        if (!raw) {
            continue;
        }
        const index = Number((chapter as HTMLElement).dataset.chapter ?? '0');
        const result = hitsOfNormalized(
            normalizedChapter(chapter, raw),
            raw,
            needle,
            Number.isFinite(index) ? index : 0,
            limit - hits.length,
        );
        hits.push(...result.hits);
        truncated = truncated || result.truncated;
    }
    return { hits, truncated };
}
