/** Поиск по тексту книги в модуле рисования плагина DjVu.
 *
 * Модуль владеет текстом книги: DjVu хранит текст зонами (слово или строка),
 * которые движок отдаёт по запросу. Поиск перебирает страницы и ищет запрос в
 * непрерывном тексте страницы, поэтому находит и фразы, а не только отдельные
 * слова. Приложению сообщается только счётчик и текущий номер: оно не знает ни
 * формата, ни раскладки.
 *
 * Вхождения считаются по тому же непрерывному тексту, по которому ставится
 * подсветка слоя, поэтому счётчик и подсветка не расходятся.
 */
import { TEXT_LAYER_CLASS, overlayOf, pagesEl, viewer } from './dom';
import { tileByLine } from './lines';
import { fractionRect } from './selection';
import type { Rect } from './types';
import { gotoPage } from './navigation';
import { post } from './protocol';
import { parseTextZones } from './text-layer';
import { state } from './state';

/** Класс слоя подсветки поиска на странице. */
export const SEARCH_LAYER_CLASS = 'search-layer';
/** Класс полосы найденного поиском. */
export const SEARCH_HIT_CLASS = 'search-hit';
/** Класс подсветки вхождения, к которому ведёт переход. */
export const SEARCH_ACTIVE_CLASS = 'search-hit-active';

/** Предел числа вхождений, между которыми можно переходить. */
export const SEARCH_LIMIT = 500;

/** Плотность, в которой запрашиваются зоны текста: координаты не важны, важен текст. */
const SEARCH_DPI = 300;

/** Сколько страниц разбирать за один проход до передачи управления браузеру. */
const SEARCH_PAGE_BATCH = 20;

/** Передача управления браузеру между порциями разбора. */
function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

/** Текст страниц по номеру (1-based): разбор страницы один раз на книгу. */
const pageTexts = new Map<number, string>();

/** Приведение текста к виду сравнения: серии пробелов — один пробел. */
export function normalizeSearchText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Непрерывный текст из строк (зон): слова склеиваются через пробел. */
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

/** Текст страницы: из кэша, из отрисованного слоя или из зон движка. */
function pageText(page: number): string {
  const cached = pageTexts.get(page);
  if (cached !== undefined) {
    return cached;
  }
  const layer = pagesEl.querySelector(`[data-page="${page}"] .${TEXT_LAYER_CLASS}`);
  const fromDom = layerNodes(layer).map((item) => item.text);
  if (fromDom.some((line) => line.trim())) {
    const text = pageTextOf(fromDom);
    pageTexts.set(page, text);
    return text;
  }
  const doc = state.doc;
  if (!doc) {
    return '';
  }
  try {
    const zones = doc.page(page - 1).text_zones_json(SEARCH_DPI);
    if (!zones) {
      return '';
    }
    const text = pageTextOf(parseTextZones(zones).map((zone) => zone.t));
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

/** Поиск по книге: страницы перебираются по порядку, состояние сообщается по ходу.
 *
 * Разбор зон ленивый и не требует отрисовки страницы, поэтому поиск идёт по всей
 * книге; состояние обновляется по ходу, чтобы панель показывала результат, не
 * дожидаясь конца. Ответ несёт запрос, поэтому результат прежнего поиска не
 * применяется к новому.
 *
 * Перебор идёт порциями: у книги на тысячи страниц сплошной цикл занял бы
 * главный поток и заморозил чтение. Между порциями управление отдаётся
 * браузеру, а состояние поиска публикуется — панель не ждёт конца.
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
  for (let page = 1; page <= state.pageCount; page += 1) {
    if (epoch !== searchSession.epoch) {
      return;
    }
    const count = countHits(pageText(page), needle);
    for (let ordinal = 0; ordinal < count; ordinal += 1) {
      if (searchSession.hits.length >= SEARCH_LIMIT) {
        searchSession.truncated = true;
        break;
      }
      searchSession.hits.push({ page, ordinal });
    }
    if (searchSession.truncated) {
      break;
    }
    if (page % SEARCH_PAGE_BATCH === 0) {
      reportSearch();
      await nextTask();
      if (epoch !== searchSession.epoch) {
        return;
      }
    }
  }
  if (epoch !== searchSession.epoch) {
    return;
  }
  searchSession.index = searchSession.hits.length > 0 ? 0 : null;
  markRenderedPages();
  reportSearch();
  if (searchSession.index !== null) {
    goToHit(searchSession.hits[searchSession.index]);
  }
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
  // Подсветка перерисовывается: активная полоса должна перейти на новое место.
  markRenderedPages();
  reportSearch();
  goToHit(searchSession.hits[next]);
}

/** Прокрутка к странице вхождения и показ его подсветки.
 *
 * Страница может быть ещё не отрисована: тогда прокрутка запускает её
 * отрисовку, а подсветка встаёт после появления текстового слоя.
 */
function goToHit(hit: SearchHit, attempt = 0): void {
  const pageEl = pagesEl.querySelector(`[data-page="${hit.page}"]`) as HTMLElement | null;
  if (!pageEl) {
    gotoPage(hit.page);
    if (attempt < 40) {
      setTimeout(() => goToHit(hit, attempt + 1), 50);
    }
    return;
  }
  const marks = pageEl.querySelectorAll(`mark[data-ordinal="${hit.ordinal}"]`);
  if (marks.length === 0) {
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
  viewer.scrollTop += bounds.top - viewerBounds.top - Math.round(bounds.height);
}

/** Снятие подсветки поиска во всём документе. */
export function clearSearchMarks(): void {
  for (const layer of Array.from(document.querySelectorAll(`.${SEARCH_LAYER_CLASS}`))) {
    layer.remove();
  }
}

/** Текстовые узлы слоя страницы с их текстом. */
function layerNodes(root: Element | null): Array<{ node: Text; text: string }> {
  if (!root) {
    return [];
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Array<{ node: Text; text: string }> = [];
  let node = walker.nextNode();
  while (node) {
    nodes.push({ node: node as Text, text: node.nodeValue ?? '' });
    node = walker.nextNode();
  }
  return nodes;
}

/** Прямоугольники вхождений на странице: номер вхождения и его полосы строк.
 *
 * Подсветка строится по прямоугольникам диапазона текстового слоя, а не по
 * разметке внутри слоя: слой прозрачен, и заливка в нём ложилась бы плёнкой
 * поверх текста, делая его мутным. Полосы ставятся отдельным слоем над растром
 * с наложением — текст под ними остаётся чётким, как под подсветкой заметки.
 */
function pageHitRects(
  pageEl: HTMLElement,
  needle: string,
): Array<{ ordinal: number; rects: Rect[] }> {
  const layer = pageEl.querySelector(`.${TEXT_LAYER_CLASS}`);
  if (!layer) {
    return [];
  }
  const nodes = layerNodes(layer).filter((item) => item.text.trim().length > 0);
  if (nodes.length === 0) {
    return [];
  }
  // Непрерывный текст и карта его символов по узлам: пробел между словами в узел
  // не входит.
  let text = '';
  const map: Array<{ node: Text; offset: number } | null> = [];
  for (const item of nodes) {
    if (text.length > 0) {
      text += ' ';
      map.push(null);
    }
    for (let index = 0; index < item.text.length; index += 1) {
      const character = item.text[index];
      if (/\s/.test(character)) {
        if (text.length > 0 && !text.endsWith(' ')) {
          text += ' ';
          map.push(null);
        }
        continue;
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
  const pageBounds = pageEl.getBoundingClientRect();
  const document = pageEl.ownerDocument;
  const result: Array<{ ordinal: number; rects: Rect[] }> = [];
  for (let ordinal = 0; ordinal < starts.length; ordinal += 1) {
    const start = starts[ordinal];
    const end = Math.min(start + needle.length, map.length);
    // Вхождение может пересекать несколько узлов: диапазон собирается от
    // первого до последнего затронутого символа.
    let first: { node: Text; offset: number } | null = null;
    let last: { node: Text; offset: number } | null = null;
    for (let index = start; index < end; index += 1) {
      const entry = map[index];
      if (!entry) {
        continue;
      }
      first ??= entry;
      last = entry;
    }
    if (!first || !last) {
      continue;
    }
    const range = document.createRange();
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + 1);
    const rects: Rect[] = [];
    for (const bounds of Array.from(range.getClientRects())) {
      if (bounds.width > 0 && bounds.height > 0) {
        rects.push(fractionRect(bounds, pageBounds));
      }
    }
    if (rects.length > 0) {
      result.push({ ordinal, rects });
    }
  }
  return result;
}

/** Подсветка всех вхождений запроса на странице отдельным слоем над растром. */
export function markPage(pageEl: HTMLElement): void {
  const needle = normalizeSearchText(searchSession.query);
  if (!needle) {
    return;
  }
  // Прежняя подсветка снимается: иначе слои складывались бы и затемняли текст.
  for (const stale of Array.from(pageEl.querySelectorAll(`.${SEARCH_LAYER_CLASS}`))) {
    stale.remove();
  }
  const overlay = overlayOf(pageEl);
  if (!overlay) {
    return;
  }
  const hits = pageHitRects(pageEl, needle);
  if (hits.length === 0) {
    return;
  }
  const layer = document.createElement('div');
  layer.className = SEARCH_LAYER_CLASS;
  const activeHit =
    searchSession.index === null ? null : searchSession.hits[searchSession.index] ?? null;
  const pageNumber = Number(pageEl.dataset.page);
  for (const hit of hits) {
    // Полосы приводятся к межстрочному шагу, как у заметки: полоса идёт по
    // всей строке, а не по рамке глифов, и щелей между строками нет.
    for (const rect of tileByLine(hit.rects).merged) {
      const band = document.createElement('div');
      band.className =
        activeHit && activeHit.page === pageNumber && activeHit.ordinal === hit.ordinal
          ? `${SEARCH_HIT_CLASS} ${SEARCH_ACTIVE_CLASS}`
          : SEARCH_HIT_CLASS;
      band.dataset.ordinal = String(hit.ordinal);
      band.style.left = rect.x * 100 + '%';
      band.style.top = rect.y * 100 + '%';
      band.style.width = rect.width * 100 + '%';
      band.style.height = rect.height * 100 + '%';
      layer.append(band);
    }
  }
  // Слой лежит под наложением заметок, но над растром и текстовым слоем.
  overlay.before(layer);
}

/** Подсветка поиска на всех отрисованных страницах. */
export function markRenderedPages(): void {
  if (!searchSession.query) {
    return;
  }
  for (const pageEl of Array.from(pagesEl.querySelectorAll('.page'))) {
    markPage(pageEl as HTMLElement);
  }
}
