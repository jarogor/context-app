/** Поиск по тексту книги в модуле рисования плагина формата.
 *
 * Модуль владеет текстом книги (в PDF — текстовый слой pdf.js), поэтому поиск
 * выполняет он, а приложению сообщает только счётчик и номер текущего
 * вхождения. Тексты страниц читаются лениво и кэшируются: повторный поиск по
 * уже прочитанным страницам не трогает документ.
 *
 * Вхождение ищется в непрерывном тексте страницы: слова текстового слоя
 * склеиваются через пробел, поэтому находится и фраза, разбитая на несколько
 * `span`. Счётчик при этом совпадает с подсветкой — она ставится по тому же
 * тексту и раскладывается обратно по узлам слоя.
 */
import { PAGE_CLASS, TEXT_LAYER_CLASS, pagesEl, viewer } from './dom';
import { gotoPage } from './navigation';
import { post } from './protocol';
import { state } from './state';

/** Класс подсветки найденного поиском. */
export const SEARCH_HIT_CLASS = 'search-hit';
/** Класс подсветки вхождения, к которому ведёт переход. */
export const SEARCH_ACTIVE_CLASS = 'search-hit-active';

/** Предел числа вхождений, между которыми можно переходить. */
export const SEARCH_LIMIT = 500;

/** Сколько страниц разбирать одновременно.
 *
 * Разбор текста страницы в pdf.js — самая долгая часть поиска. Последовательный
 * перебор большой книги занимал десятки секунд, поэтому страницы читаются
 * небольшими порциями параллельно: главный поток занят короткими рывками, а
 * книга просматривается в несколько раз быстрее.
 */
const SEARCH_CONCURRENCY = 8;

/** Вхождение запроса: страница и порядковый номер вхождения на ней. */
export interface SearchHit {
  /** Номер страницы (1-based). */
  page: number;
  /** Порядковый номер вхождения на странице, с нуля. */
  ordinal: number;
}

/** Текущее состояние поиска модуля. */
export interface SearchSession {
  /** Запрос поиска. */
  query: string;
  /** Найденные вхождения в порядке чтения. */
  hits: SearchHit[];
  /** Номер вхождения, к которому ведёт переход. */
  index: number | null;
  /** Найдено больше вхождений, чем предел. */
  truncated: boolean;
  /** Поколение поиска: запрос мог смениться, пока страницы читались. */
  epoch: number;
}

/** Текущее состояние поиска. */
export const searchSession: SearchSession = {
  query: '',
  hits: [],
  index: null,
  truncated: false,
  epoch: 0,
};

/** Тексты страниц по номеру (1-based): разбор страницы один раз на книгу. */
const pageTexts = new Map<number, string>();

/** Приведение текста к виду сравнения: серии пробелов — один пробел. */
export function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Непрерывный текст страницы из её строк: слова склеиваются через пробел. */
export function pageTextOf(lines: string[]): string {
  return normalizeSearchText(lines.filter((line) => line.trim().length > 0).join(' '));
}

/** Сброс кэша текстов страниц (новая книга). */
export function resetSearchTexts(): void {
  pageTexts.clear();
  searchSession.query = '';
  searchSession.hits = [];
  searchSession.index = null;
  searchSession.truncated = false;
  searchSession.epoch += 1;
  clearSearchMarks();
}

/** Строки текста из текстового слоя отрисованной страницы. */
function layerLines(pageEl: HTMLElement): string[] {
  const layer = pageEl.querySelector(`.${TEXT_LAYER_CLASS}`);
  if (!layer) {
    return [];
  }
  const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
  const lines: string[] = [];
  let node = walker.nextNode();
  while (node) {
    const value = node.nodeValue ?? '';
    if (value.trim()) {
      lines.push(value);
    }
    node = walker.nextNode();
  }
  return lines;
}

/** Текст страницы: из кэша, из отрисованной страницы или из документа. */
async function pageText(page: number): Promise<string> {
  const cached = pageTexts.get(page);
  if (cached !== undefined) {
    return cached;
  }
  const pageEl = pagesEl.querySelector(`.${PAGE_CLASS}[data-page="${page}"]`) as
    | HTMLElement
    | null;
  const fromDom = pageEl ? layerLines(pageEl) : [];
  if (fromDom.length > 0) {
    const text = pageTextOf(fromDom);
    pageTexts.set(page, text);
    return text;
  }
  const doc = state.doc;
  if (!doc) {
    return '';
  }
  try {
    const content = await doc.getPage(page).then((target) => target.getTextContent());
    const text = pageTextOf(content.items.map((item) => ('str' in item ? item.str : '')));
    pageTexts.set(page, text);
    return text;
  } catch (error) {
    return '';
  }
}

/** Число вхождений запроса в тексте. */
function countHits(text: string, needle: string): number {
  if (!needle || !text) {
    return 0;
  }
  let count = 0;
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) {
      return count;
    }
    count += 1;
    from = at + Math.max(1, needle.length);
  }
}

/** Сообщение приложению о состоянии поиска. */
function reportSearch(): void {
  post({
    type: 'search',
    value: {
      query: searchSession.query,
      total: searchSession.hits.length,
      index: searchSession.index,
      truncated: searchSession.truncated,
    },
  });
}

/** Поиск по книге: страницы читаются порциями, состояние сообщается по ходу.
 *
 * Поиск идёт в фоне и не блокирует чтение: приложение получает обновлённый
 * счётчик по ходу разбора и итог в конце. Ответ несёт запрос, поэтому
 * результат прежнего поиска не применяется к новому.
 *
 * Разбор начинается с текущей страницы и идёт вперёд, затем замыкается на
 * начало книги. Читатель чаще ищет рядом с местом чтения, и первый результат
 * приходит почти сразу, а не после разбора всей книги с первой страницы.
 * Собранные вхождения к концу поиска упорядочиваются по книге, чтобы переходы
 * шли в порядке чтения.
 */
export async function searchBook(query: string): Promise<void> {
  const needle = normalizeSearchText(query);
  searchSession.epoch += 1;
  const epoch = searchSession.epoch;
  searchSession.query = query;
  searchSession.hits = [];
  searchSession.index = null;
  searchSession.truncated = false;
  clearSearchMarks();
  reportSearch();
  if (!needle || !state.doc) {
    return;
  }
  const start = Math.max(1, Math.min(state.pageCount, state.currentPage || 1));
  const order: number[] = [];
  for (let page = start; page <= state.pageCount; page += 1) {
    order.push(page);
  }
  for (let page = 1; page < start; page += 1) {
    order.push(page);
  }
  for (let from = 0; from < order.length; from += SEARCH_CONCURRENCY) {
    const pages = order.slice(from, from + SEARCH_CONCURRENCY);
    const texts = await Promise.all(pages.map((page) => pageText(page)));
    if (epoch !== searchSession.epoch) {
      return;
    }
    const found: SearchHit[] = [];
    for (let offset = 0; offset < pages.length; offset += 1) {
      const page = pages[offset];
      const count = countHits(texts[offset], needle);
      for (let ordinal = 0; ordinal < count; ordinal += 1) {
        if (searchSession.hits.length + found.length >= SEARCH_LIMIT) {
          searchSession.truncated = true;
          break;
        }
        found.push({ page, ordinal });
      }
      if (searchSession.truncated) {
        break;
      }
    }
    searchSession.hits.push(...found);
    // Первое найденное показывается сразу: читатель видит место, не дожидаясь,
    // пока разберётся вся книга.
    if (searchSession.hits.length > 0 && searchSession.index === null) {
      searchSession.index = 0;
      markRenderedPages();
      reportSearch();
      goToHit(searchSession.hits[0]);
    } else if (found.length > 0) {
      reportSearch();
    }
    if (searchSession.truncated) {
      break;
    }
    // Между порциями управление отдаётся браузеру: отрисовка страниц и ввод в
    // поле поиска не ждут конца разбора всей книги.
    await nextTask();
    if (epoch !== searchSession.epoch) {
      return;
    }
  }
  if (epoch !== searchSession.epoch) {
    return;
  }
  // Вхождения — в порядке чтения, а не в порядке разбора от текущей страницы.
  searchSession.hits.sort((first, second) => first.page - second.page || first.ordinal - second.ordinal);
  searchSession.index = searchSession.hits.length > 0 ? 0 : null;
  markRenderedPages();
  reportSearch();
  if (searchSession.index !== null) {
    goToHit(searchSession.hits[searchSession.index]);
  }
}

/** Передача управления браузеру между порциями разбора. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Переход к соседнему вхождению поиска по кругу. */
export function stepSearch(delta: 1 | -1): void {
  const total = searchSession.hits.length;
  if (total === 0) {
    return;
  }
  const current = searchSession.index;
  const next = current === null ? (delta > 0 ? 0 : total - 1) : (current + delta + total) % total;
  searchSession.index = next;
  reportSearch();
  goToHit(searchSession.hits[next]);
}

/** Прокрутка к странице вхождения и показ его подсветки.
 *
 * Страница может быть ещё не отрисована: тогда прокрутка к ней запускает её
 * отрисовку, а подсветка встаёт после появления текстового слоя. Без прокрутки
 * найденное на невидимой странице не подсвечивается, и переход молча пропадал.
 */
function goToHit(hit: SearchHit, attempt = 0): void {
  const pageEl = pagesEl.querySelector(`.${PAGE_CLASS}[data-page="${hit.page}"]`) as
    | HTMLElement
    | null;
  if (!pageEl) {
    gotoPage(hit.page);
    if (attempt < 40) {
      setTimeout(() => goToHit(hit, attempt + 1), 50);
    }
    return;
  }
  const marks = pageEl.querySelectorAll(`mark[data-ordinal="${hit.ordinal}"]`);
  if (marks.length === 0) {
    if (attempt === 0) {
      // Прокрутка к странице запускает её отрисовку: без неё подсветки не будет.
      gotoPage(hit.page);
    }
    if (attempt < 40) {
      setTimeout(() => goToHit(hit, attempt + 1), 50);
    }
    return;
  }
  for (const mark of Array.from(document.querySelectorAll(`.${SEARCH_ACTIVE_CLASS}`))) {
    mark.classList.remove(SEARCH_ACTIVE_CLASS);
  }
  for (const mark of Array.from(marks)) {
    mark.classList.add(SEARCH_ACTIVE_CLASS);
  }
  const active = marks[0] as HTMLElement;
  const viewerBounds = viewer.getBoundingClientRect();
  const bounds = active.getBoundingClientRect();
  // Найденное ставится на строку ниже верха области: над ним остаётся
  // контекст соседних строк.
  viewer.scrollTop += bounds.top - viewerBounds.top - Math.round(bounds.height);
}

/** Снятие подсветки поиска во всём документе. */
export function clearSearchMarks(): void {
  for (const mark of Array.from(document.querySelectorAll(`mark.${SEARCH_HIT_CLASS}`))) {
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

/** Текстовые узлы слоя страницы с их текстом. */
function layerNodes(root: Node): Array<{ node: Text; text: string }> {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; text: string }> = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push({ node: node as Text, text: node.nodeValue ?? '' });
    node = walker.nextNode();
  }
  return nodes;
}

/** Подсветка всех вхождений запроса в текстовом слое страницы.
 *
 * Вхождение может пересекать несколько узлов: каждое соприкасающееся слово
 * оборачивается в собственный `<mark>` с номером вхождения, поэтому переход к
 * вхождению подсвечивает его целиком.
 *
 * Куски одного узла собираются в новое содержимое узла за один раз: вставка
 * `<mark>` по одному перестраивала весь текст узла на каждое вхождение, и на
 * плотной странице это было заметно.
 */
export function markPage(pageEl: HTMLElement): void {
  const needle = normalizeSearchText(searchSession.query);
  const layer = pageEl.querySelector(`.${TEXT_LAYER_CLASS}`);
  if (!needle || !layer) {
    return;
  }
  const nodes = layerNodes(layer);
  // Непрерывный текст слоя и карта его символов по узлам: пробел между словами
  // в узел не входит.
  let text = '';
  const map: Array<{ node: Text; offset: number } | null> = [];
  for (const item of nodes) {
    if (!item.text.trim()) {
      continue;
    }
    if (text.length > 0 && !text.endsWith(' ')) {
      text += ' ';
      map.push(null);
    }
    let pendingSpace = false;
    for (let index = 0; index < item.text.length; index += 1) {
      const character = item.text[index];
      if (/\s/.test(character)) {
        pendingSpace = text.length > 0 && !text.endsWith(' ');
        continue;
      }
      if (pendingSpace) {
        text += ' ';
        map.push(null);
        pendingSpace = false;
      }
      text += character.toLowerCase();
      map.push({ node: item.node, offset: index });
    }
  }
  const starts: number[] = [];
  let from = 0;
  for (;;) {
    const at = text.indexOf(needle, from);
    if (at < 0) {
      break;
    }
    starts.push(at);
    from = at + Math.max(1, needle.length);
  }
  if (starts.length === 0) {
    return;
  }
  // Куски подсветки по узлам: узел → границы кусков и номер вхождения.
  const fragments = new Map<Text, Array<{ from: number; to: number; ordinal: number }>>();
  for (let ordinal = 0; ordinal < starts.length; ordinal += 1) {
    const start = starts[ordinal];
    const end = Math.min(start + needle.length, map.length);
    for (let index = start; index < end; index += 1) {
      const entry = map[index];
      if (!entry) {
        continue;
      }
      const spans = fragments.get(entry.node);
      const span = spans?.[spans.length - 1];
      // Соседние символы одного узла — один кусок подсветки.
      if (span && span.ordinal === ordinal && span.to === entry.offset) {
        span.to = entry.offset + 1;
        continue;
      }
      if (spans) {
        spans.push({ from: entry.offset, to: entry.offset + 1, ordinal });
      } else {
        fragments.set(entry.node, [{ from: entry.offset, to: entry.offset + 1, ordinal }]);
      }
    }
  }
  for (const [node, spans] of fragments) {
    const value = node.nodeValue ?? '';
    const replacement = document.createDocumentFragment();
    let position = 0;
    for (const span of spans) {
      if (span.from > position) {
        replacement.append(value.slice(position, span.from));
      }
      if (span.to > span.from) {
        const mark = document.createElement('mark');
        mark.className = SEARCH_HIT_CLASS;
        mark.dataset.ordinal = String(span.ordinal);
        mark.textContent = value.slice(span.from, span.to);
        replacement.append(mark);
      }
      position = Math.max(position, span.to);
    }
    if (position < value.length) {
      replacement.append(value.slice(position));
    }
    node.replaceWith(replacement);
  }
}

/** Подсветка поиска на всех отрисованных страницах. */
export function markRenderedPages(): void {
  if (!searchSession.query) {
    return;
  }
  for (const pageEl of Array.from(pagesEl.querySelectorAll(`.${PAGE_CLASS}`))) {
    markPage(pageEl as HTMLElement);
  }
}
