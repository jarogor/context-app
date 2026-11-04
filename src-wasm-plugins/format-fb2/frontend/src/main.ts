/** Точка входа модуля рисования плагина формата чтения FB2.
 *
 * Приложение присылает главы книги и непрозрачные заметки, а модуль рисует
 * текст, подсветки, наложения и поиск. Управление, панель заметок и свойства
 * файла принадлежат приложению: плагин сообщает события и получает команды.
 */

import { chaptersEl, scrollProgress, scrollRoot, status } from './dom';
import { applyReaderTheme, bookStyle, CHAPTER_CLASS } from './document';
import {
  createAnchor,
  chapterTextOf,
  offsetsFromRange,
  parseAnchor,
  rangeFromOffsets,
  resolveAnchorRange,
  type QuoteAnchor,
} from './anchor';
import { clearNoteMarks, highlightTextRange } from './highlight';
import {
  NOTE_OVERLAY_CLASS,
  clearNoteOverlays,
  parseGeometry,
  renderShape,
  renderTextCard,
  serializeGeometry,
} from './overlay';
import { chapterAt, charOffset, clamp01, pointFraction, rangeHandleRect } from './geometry';
import { applyZoom, captureAnchor, restoreAnchor } from './zoom-anchor';
import { anchorTarget, parseBookLink } from './book-link';
import {
  FOOTNOTE_BACK_CLASS,
  bookFootnote,
  footnoteContentHtml,
  installFootnoteReturns,
} from './footnote';
import { clearSelectionLayer, renderSelectionLayer } from './selection';
import {
  clearSearchHighlights,
  highlightSearchHits,
  SEARCH_ACTIVE_CLASS,
  SEARCH_CLASS,
} from './search-mark';
import { searchBook, type SearchHit } from './search';
import { setViewerLocale, viewerText } from './locale';
import { NOTE_CLASS, FLASH_CLASS, FOOTNOTE_FLASH_CLASS } from './document';
import { decodeText, parseIncoming, post, type ViewerBinding, type ViewerNote, type ViewerTool } from './protocol';

/** Состояние чтения плагина. */
const state = {
  /** Главы книги: пришли от приложения готовым HTML. */
  chapters: [] as { title?: string | null; html: string }[],
  /** Заметки книги. */
  notes: [] as ViewerNote[],
  /** Активный инструмент. */
  tool: { type: 'quote', shape: 'line', color: 'yellow' } as ViewerTool,
  /** Текущий масштаб в процентах. */
  zoom: 100,
  /** Последняя позиция чтения в процентах. */
  progress: 0,
  /** Поисковые вхождения. */
  hits: [] as SearchHit[],
  /** Активное вхождение поиска. */
  activeHit: null as number | null,
  /** Запрос поиска. */
  query: '',
  /** Привязки клавиш приложения. */
  bindings: [] as ViewerBinding[],
  /** Признак загруженной книги. */
  opened: false,
  /** Название книги. */
  title: '',
  /** Последняя тема области чтения, присланная приложением. */
  theme: null as import('./document').ReaderThemeMessage | null,
};

/** Документ книги внутри области. */
function bookDocument(): Document {
  return chaptersEl.ownerDocument;
}

/** Раздел главы по индексу. */
function chapterSection(index: number): Element | null {
  return chaptersEl.querySelector(`.${CHAPTER_CLASS}[data-chapter="${index}"]`);
}

/** Разделы глав по порядку. */
function chapterSections(): Element[] {
  return Array.from(chaptersEl.querySelectorAll(`.${CHAPTER_CLASS}`));
}

/** Место цитаты: глава, диапазон и его смещения. */
function resolveQuotePlace(
  anchor: QuoteAnchor,
): { section: Element; range: Range; start: number; end: number } | null {
  if (anchor.kind !== 'text') {
    return null;
  }
  const section = chapterSection(anchor.chapter);
  if (section) {
    const resolved = resolveAnchorRange(section, anchor);
    if (resolved) {
      return { section, range: resolved.range, start: resolved.start, end: resolved.end };
    }
  }
  for (const candidate of chapterSections()) {
    if (candidate === section) {
      continue;
    }
    const resolved = resolveAnchorRange(candidate, anchor);
    if (resolved) {
      return { section: candidate, range: resolved.range, start: resolved.start, end: resolved.end };
    }
  }
  return null;
}

/** Применение активного инструмента к документу. */
function applyTool(): void {
  const body = bookDocument().body;
  body.dataset.tool = state.tool.type;
}

/** Подсветка одной заметки-цитаты. */
function highlightNote(note: ViewerNote, anchorOverride?: QuoteAnchor): void {
  const anchor = anchorOverride ?? parseAnchor(note.anchor ?? '');
  if (!anchor || note.type !== 'quote') {
    return;
  }
  const place = resolveQuotePlace(anchor);
  if (!place) {
    return;
  }
  highlightTextRange(
    place.section,
    place.start,
    place.end,
    NOTE_CLASS,
    note.id,
    note.color ?? 'yellow',
  );
}

/** Наложение карточки или фигуры. */
function drawOverlay(note: ViewerNote, anchorOverride?: QuoteAnchor, geometryOverride?: string): void {
  const anchor = anchorOverride ?? parseAnchor(note.anchor ?? '');
  if (!anchor) {
    return;
  }
  const section = chapterSection(anchor.chapter);
  if (!section) {
    return;
  }
  const placed = { ...note, anchor: JSON.stringify(anchor) } as Parameters<typeof renderTextCard>[1];
  if (note.type === 'text') {
    renderTextCard(section, placed);
  } else if (note.type === 'shape') {
    renderShape(section, { ...placed, geometry: geometryOverride ?? note.geometry });
  }
}

/** Снятие подсветки и наложения одной заметки. */
function clearNote(noteId: string): void {
  const doc = bookDocument();
  clearNoteMarks(doc, `mark.${NOTE_CLASS}[data-note-id="${noteId}"]`);
  clearNoteOverlays(doc, `.${NOTE_OVERLAY_CLASS}[data-note-id="${noteId}"]`);
}

/** Полная перерисовка заметок. */
function drawNotes(): void {
  const doc = bookDocument();
  clearNoteMarks(doc, `mark.${NOTE_CLASS}`);
  clearNoteOverlays(doc, `.${NOTE_OVERLAY_CLASS}`);
  for (const note of state.notes) {
    if (note.type === 'quote' || note.type === undefined) {
      highlightNote(note);
    } else {
      drawOverlay(note);
    }
  }
}

/** Инкрементальное обновление разметки заметок. */
function syncNotes(previous: ViewerNote[]): void {
  const current = new Map(state.notes.map((note) => [note.id, note]));
  for (const note of previous) {
    if (!current.has(note.id)) {
      clearNote(note.id);
    }
  }
  for (const note of state.notes) {
    const was = previous.find((candidate) => candidate.id === note.id);
    const unchanged =
      was !== undefined &&
      was.type === note.type &&
      was.anchor === note.anchor &&
      was.color === note.color;
    if (unchanged) {
      continue;
    }
    clearNote(note.id);
    if (note.type === 'quote' || note.type === undefined) {
      highlightNote(note);
    } else {
      drawOverlay(note);
    }
  }
}

/** Прокрутка к абсолютной позиции в документе с отступом сверху.
 *
 * `target` — смещение цели от начала документа (уже с учётом текущей
 * прокрутки), поэтому `scrollTop` здесь не прибавляется: иначе каждая
 * следующая прокрутка уезжала бы дальше вниз и книга не возвращалась вверх.
 * Цель, которая уже видна в области, не прокручивается вовсе.
 */
function scrollToTarget(target: number, margin: number): void {
  const root = scrollRoot();
  const height = root.clientHeight;
  const top = Math.max(0, target - margin);
  const visible = top >= root.scrollTop && top <= root.scrollTop + height - margin;
  if (visible) {
    return;
  }
  const distance = Math.abs(top - root.scrollTop);
  root.scrollTo({ top, behavior: distance > height * 1.5 ? 'auto' : 'smooth' });
}

/** Переход к доле книги. */
function gotoPercent(percent: number): void {
  const root = scrollRoot();
  const max = root.scrollHeight - root.clientHeight;
  if (max > 0) {
    root.scrollTo({ top: max * (Math.max(0, Math.min(100, percent)) / 100) });
  }
}

/** Переход к якорю заметки с показом выделения. */
function gotoAnchor(note: ViewerNote): void {
  const anchor = parseAnchor(note.anchor ?? '');
  const quote = anchor ? resolveQuotePlace(anchor) : null;
  const section = quote?.section ?? (anchor ? chapterSection(anchor.chapter) : null);
  if (anchor?.kind === 'point' && section) {
    const rect = section.getBoundingClientRect();
    scrollToTarget(rect.top + scrollRoot().scrollTop, 120);
  } else if (quote) {
    const target = quote.range.getBoundingClientRect().top + scrollRoot().scrollTop;
    scrollToTarget(target, 80);
  } else if (anchor && anchor.percent > 0) {
    gotoPercent(anchor.percent);
  }
  for (const mark of Array.from(
    bookDocument().querySelectorAll(`mark.${NOTE_CLASS}[data-note-id="${note.id}"]`),
  )) {
    mark.classList.add(FLASH_CLASS);
    setTimeout(() => mark.classList.remove(FLASH_CLASS), 300);
  }
  for (const overlay of Array.from(
    bookDocument().querySelectorAll(`.${NOTE_OVERLAY_CLASS}[data-note-id="${note.id}"]`),
  )) {
    overlay.classList.add(FLASH_CLASS);
    setTimeout(() => overlay.classList.remove(FLASH_CLASS), 300);
  }
}

/** Переход к главе из панели содержания. */
function gotoChapter(index: number): void {
  const section = chapterSection(index);
  if (!section) {
    return;
  }
  const target = section.getBoundingClientRect().top + scrollRoot().scrollTop;
  scrollToTarget(target, 80);
  reportProgress();
}

/** Подсветка найденных вхождений. */
function highlightSearch(): void {
  const doc = bookDocument();
  clearSearchHighlights(doc);
  const active = state.activeHit === null ? null : state.hits[state.activeHit];
  for (const section of chapterSections()) {
    const chapter = Number((section as HTMLElement).dataset.chapter ?? '0');
    const hits = state.hits.filter((hit) => hit.chapter === chapter);
    if (hits.length === 0) {
      continue;
    }
    highlightSearchHits(section, hits, active && active.chapter === chapter ? active.start : null);
  }
}

/** Поиск по книге. */
function searchBookContent(query: string): void {
  state.query = query.trim();
  if (!state.query) {
    state.hits = [];
    state.activeHit = null;
    clearSearchHighlights(bookDocument());
    post({ type: 'search', value: { query: '', total: 0, index: null } });
    return;
  }
  const result = searchBook(chapterSections(), state.query, chapterTextOf);
  state.hits = result.hits;
  state.activeHit = result.hits.length > 0 ? 0 : null;
  highlightSearch();
  post({
    type: 'search',
    value: {
      query: state.query,
      total: result.hits.length,
      index: state.activeHit,
      truncated: result.truncated,
    },
  });
}

/** Переход к вхождению поиска. */
function stepSearch(delta: number): void {
  if (state.hits.length === 0) {
    return;
  }
  const next =
    state.activeHit === null
      ? 0
      : (state.activeHit + delta + state.hits.length) % state.hits.length;
  state.activeHit = next;
  const doc = bookDocument();
  for (const mark of Array.from(doc.querySelectorAll<HTMLElement>(`mark.${SEARCH_CLASS}`))) {
    mark.classList.remove(SEARCH_ACTIVE_CLASS);
  }
  const hit = state.hits[next];
  const section = chapterSection(hit.chapter);
  if (section) {
    for (const mark of Array.from(
      section.querySelectorAll<HTMLElement>(`mark.${SEARCH_CLASS}`),
    )) {
      if (mark.dataset.start === String(hit.start)) {
        mark.classList.add(SEARCH_ACTIVE_CLASS);
      }
    }
    const active = section.querySelector(`mark.${SEARCH_ACTIVE_CLASS}`);
    if (active) {
      const target = active.getBoundingClientRect().top + scrollRoot().scrollTop;
      scrollToTarget(target, 120);
    }
  }
  post({
    type: 'search',
    value: {
      query: state.query,
      total: state.hits.length,
      index: next,
      truncated: false,
    },
  });
}

/** Отчёт о позиции чтения. */
function reportProgress(): void {
  state.progress = scrollProgress();
  post({ type: 'progress', value: state.progress });
}

/** Открытие книги: главы уже разобраны плагином WASM и пришли готовым HTML. */
function openBook(chapters: { title?: string | null; html: string }[], position: number): void {
  state.chapters = chapters;
  // Документ собирается целиком: оформление области чтения лежит в его `<head>`,
  // а главы — в теле. Стиль не вставляется по месту, поэтому типографика книги
  // (заголовки, цитаты, ссылки) действует одинаково для всех глав.
  // Документ собирается целиком, но без `document.open()`: он стирает
  // слушателей окна, и плагин перестал бы получать команды приложения.
  // Оформление ставится в существующий `<head>`, а главы заменяют тело.
  const doc = bookDocument();
  let style = doc.getElementById('context-book-style') as HTMLStyleElement | null;
  if (!style) {
    style = doc.createElement('style');
    style.id = 'context-book-style';
    doc.head.appendChild(style);
  }
  style.textContent = bookStyle();
  chaptersEl.innerHTML = chapters
    .map(
      (chapter, index) =>
        `<section class="${CHAPTER_CLASS}" data-chapter="${index}">${chapter.html}</section>`,
    )
    .join('\n');
  if (state.theme) {
    applyReaderTheme(bookDocument().documentElement, state.theme);
  }
  state.opened = true;
  status.hidden = true;
  applyTool();
  drawNotes();
  if (position > 0) {
    gotoPercent(position);
  }
  // Сноски получают ссылки возврата: возврат есть у всех сносок книги.
  installFootnoteReturns(bookDocument());
  reportProgress();
  post({ type: 'state', value: { page: null, pages: null } });
  // Содержание книги — её главы: панель свойств показывает их списком.
  post({
    type: 'contents',
    value: chapters.map((chapter, index) => ({
      index,
      title: chapter.title ?? `Глава ${index + 1}`,
    })),
  });
  post({
    type: 'capabilities',
    value: { zoom: true, pages: false, selection: true, flowing: true },
  });
}

/** Смена инструмента. */
function applyToolMessage(tool: ViewerTool): void {
  state.tool = tool;
  applyTool();
}

/** Обработка входящего сообщения. */
function handleMessage(event: MessageEvent): void {
  const message = parseIncoming(event.data);
  if (!message) {
    return;
  }
  switch (message.type) {
    case 'open': {
      // Байты книги разобраны плагином WASM: сюда приходят готовые главы
      // JSON-ом в base64? Нет — приложение присылает JSON глав текстом.
      const content = JSON.parse(decodeText(message.data)) as {
        title?: string;
        chapters?: { title?: string | null; html: string }[];
      };
      state.title = String(content.title ?? '');
      state.zoom = message.zoom;
      applyZoom(bookDocument(), message.zoom);
      openBook(content.chapters ?? [], message.position);
      break;
    }
    case 'zoom':
      state.zoom = message.value;
      applyZoom(bookDocument(), message.value);
      clearSelectionLayer(bookDocument());
      break;
    case 'goto': {
      const value = message.value;
      if (value.noteId) {
        const note = state.notes.find((candidate) => candidate.id === value.noteId);
        if (note) {
          gotoAnchor(note);
        }
      } else if (typeof value.chapter === 'number') {
        gotoChapter(value.chapter);
      } else if (typeof value.page === 'number') {
        gotoChapter(value.page);
      } else if (value.anchor) {
        gotoAnchor({ id: '', type: 'quote', anchor: value.anchor, quote: '', color: 'yellow' });
      }
      break;
    }
    case 'note-menu-action':
      // Правка заметки принадлежит оболочке: плагин лишь исполняет команду над
      // своим документом — перемещение или сдвиг границ цитаты.
      runNoteMenuAction(message.value.noteId, message.value.action);
      break;
    case 'notes': {
      const previous = state.notes;
      state.notes = message.value;
      if (previous.length === 0) {
        drawNotes();
      } else {
        syncNotes(previous);
      }
      break;
    }
    case 'tool':
      applyToolMessage(message.value);
      break;
    case 'reader-theme':
      // Тема запоминается: документ книги пересобирается при открытии, и
      // присланные ранее переменные нужно применить к новому корню.
      state.theme = message.value;
      applyReaderTheme(bookDocument().documentElement, message.value);
      drawNotes();
      break;
    case 'reader-locale':
      setViewerLocale(message.value);
      break;
    case 'show':
      reportProgress();
      break;
    case 'footnote-close':
      // Оболочка закрыла меню сноски: маркер забывается, и следующий клик по
      // нему снова открывает меню.
      openFootnoteMarker = null;
      break;
    case 'clear-selection': {
      // Выделение принадлежит документу книги: снимается оно здесь, а не в
      // оболочке, иначе слой выделения остался бы на странице.
      const doc = bookDocument();
      doc.getSelection()?.removeAllRanges();
      renderSelectionLayer(doc, null);
      break;
    }
    case 'search':
      searchBookContent(message.value.query);
      break;
    case 'search-step':
      stepSearch(message.value.delta < 0 ? -1 : 1);
      break;
    case 'hotkey-bindings':
      state.bindings = message.value;
      break;
    case 'command':
      runCommand(message.value.id);
      break;
    default:
      break;
  }
}

/** Прокрутка по команде приложения. */
function runCommand(id: string): void {
  switch (id) {
    case 'reader.screen.next':
      scrollRoot().scrollTop += scrollRoot().clientHeight;
      reportProgress();
      break;
    case 'reader.screen.prev':
      scrollRoot().scrollTop = Math.max(0, scrollRoot().scrollTop - scrollRoot().clientHeight);
      reportProgress();
      break;
    case 'reader.book.start':
      scrollRoot().scrollTop = 0;
      reportProgress();
      break;
    case 'reader.book.end':
      scrollRoot().scrollTop = scrollRoot().scrollHeight;
      reportProgress();
      break;
    default:
      break;
  }
}

/** Нажатие клавиши внутри книги: распознаётся по описаниям приложения.
 *
 * Полей события хватает: код клавиши физический, модификаторы — булевы
 * признаки. Правил разбора сочетаний у плагина нет, поэтому одно действие не
 * может означать разное в книге и в оболочке.
 */
function handleKeyDown(event: KeyboardEvent): void {
  if (event.defaultPrevented || event.isComposing) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) {
    return;
  }
  const binding = state.bindings.find(
    (item) =>
      (item.code ?? '') === event.code &&
      Boolean(item.ctrl) === event.ctrlKey &&
      Boolean(item.alt) === event.altKey &&
      Boolean(item.shift) === event.shiftKey &&
      Boolean(item.meta) === event.metaKey,
  );
  if (!binding) {
    return;
  }
  event.preventDefault();
  post({ type: 'hotkey', value: { id: binding.id } });
}

/** Позиция курсора после выделения: меню создания заметки. */
function handleSelectionEnd(): void {
  const doc = bookDocument();
  const selection = doc.getSelection();
  // Слой активного выделения рисуется здесь же: событие `selectionchange` в
  // программно выставленном диапазоне приходит не всегда, а выделение уже есть.
  renderSelectionLayer(
    doc,
    selection && !selection.isCollapsed && selection.rangeCount > 0
      ? selection.getRangeAt(0)
      : null,
  );
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    post({ type: 'selection-cleared' });
    return;
  }
  const range = selection.getRangeAt(0);
  const elementOf = (node: Node | null) =>
    node ? (node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement) : null;
  const start = elementOf(range.startContainer)?.closest(`.${CHAPTER_CLASS}`);
  const end = elementOf(range.endContainer)?.closest(`.${CHAPTER_CLASS}`);
  if (!start || start !== end) {
    post({ type: 'selection-cleared' });
    return;
  }
  const offsets = offsetsFromRange(start, range);
  const quote = range.toString().replace(/\s+/g, ' ').trim();
  if (!offsets || !quote) {
    post({ type: 'selection-cleared' });
    return;
  }
  const rect = range.getBoundingClientRect();
  const height = scrollRoot().scrollHeight;
  const percent =
    height > 0 ? Math.max(0, Math.min(100, ((rect.top + scrollRoot().scrollTop) / height) * 100)) : 0;
  const chapter = Number((start as HTMLElement).dataset.chapter ?? '0');
  const anchor = createAnchor({
    chapter: Number.isFinite(chapter) ? chapter : 0,
    start: offsets.start,
    end: offsets.end,
    quote,
    percent,
    page: null,
  });
  // Меню ставится у конца выделения (правого края последней строки): у рамки
  // всего диапазона левый край — это отступ страницы, и при выделении в
  // несколько строк меню уезжало к краю области, а не к курсору.
  const rects = range.getClientRects();
  const endRect = rects.length > 0 ? rects[rects.length - 1] : rect;
  post({
    type: 'selection',
    value: {
      anchor,
      x: Math.max(8, Math.min(endRect.right, window.innerWidth - 180)),
      y: Math.max(8, endRect.bottom + 6),
    },
  });
}

/** Доля позиции по вертикали области. */
function percentAt(clientY: number): number {
  const height = scrollRoot().scrollHeight;
  return height > 0
    ? Math.max(0, Math.min(100, ((clientY + scrollRoot().scrollTop) / height) * 100))
    : 0;
}

/** Маркер открытой сейчас сноски: повторный клик закрывает меню. */
let openFootnoteMarker: Element | null = null;

/** Клик по книге: ссылки, сноски и выбор заметки. */
function handleClick(event: MouseEvent): void {
  const target = event.target as Element | null;
  const link = target?.closest?.('a[href]') as HTMLAnchorElement | null;
  if (link) {
    event.preventDefault();
    const doc = bookDocument();
    if (link.classList.contains(FOOTNOTE_BACK_CLASS)) {
      const id = (link.getAttribute('href') ?? '').replace(/^#/, '');
      const source = anchorTarget(doc, id);
      if (source) {
        scrollToTarget(
          source.getBoundingClientRect().top + scrollRoot().scrollTop,
          120,
        );
        source.classList.add(FOOTNOTE_FLASH_CLASS);
        setTimeout(() => source.classList.remove(FOOTNOTE_FLASH_CLASS), 600);
      }
      return;
    }
    const parsed = parseBookLink(link.getAttribute('href'));
    if (parsed.kind === 'anchor' && parsed.anchor) {
      const footnote = bookFootnote(link, doc);
      if (footnote) {
        // Повторный клик по тому же маркеру закрывает меню: читатель уже
        // прочитал сноску и возвращается к тексту.
        if (openFootnoteMarker === link) {
          openFootnoteMarker = null;
          post({ type: 'footnote-close' });
          return;
        }
        openFootnoteMarker = link;
        // Сноска показывается меню оболочки у её маркера: плагин владеет
        // разметкой книги и готовит содержимое, а меню рисует приложение.
        const rect = link.getBoundingClientRect();
        post({
          type: 'footnote',
          value: {
            html: footnoteContentHtml(footnote.target),
            anchor: footnote.anchor,
            left: rect.left,
            top: rect.top,
            bottom: rect.bottom,
          },
        });
        return;
      }
      const goal = anchorTarget(doc, parsed.anchor);
      if (goal) {
        scrollToTarget(goal.getBoundingClientRect().top + scrollRoot().scrollTop, 120);
      }
      return;
    }
    if (parsed.kind === 'external') {
      // Форма сообщения — как у протокола приложения: значение в `value`.
      post({ type: 'open-link', value: { href: parsed.href } });
    }
    return;
  }
  const element = target?.closest?.(`mark.${NOTE_CLASS}, .${NOTE_OVERLAY_CLASS}`) as Element | null;
  const noteId = (element as HTMLElement | null)?.dataset.noteId;
  if (noteId && element) {
    const shape = element.querySelector('line,rect,ellipse');
    const rect = (shape ?? element).getBoundingClientRect();
    post({ type: 'note-click', value: { noteId } });
    post({
      type: 'note-menu',
      value: {
        noteId,
        noteType:
          state.notes.find((note) => note.id === noteId)?.type ?? 'quote',
        left: rect.left,
        top: rect.bottom,
        bottom: rect.bottom,
      },
    });
  }
}

/** Нажатие на маркер границы: начало сдвига края цитаты. */
function beginResizeDrag(event: MouseEvent): boolean {
  const target = event.target as Element | null;
  const handle = target?.closest?.('[data-note-handle]') as Element | null;
  if (!resizeEditing || !handle) {
    return false;
  }
  event.preventDefault();
  const edge = handle.getAttribute('data-note-handle') === 'start' ? 'start' : 'end';
  const doc = bookDocument();
  const move = (moveEvent: MouseEvent) => {
    const editing = resizeEditing;
    if (!editing) {
      return;
    }
    const section = chapterSection(editing.anchor.chapter);
    if (!section) {
      return;
    }
    const point = offsetAtPoint(section, moveEvent.clientX, moveEvent.clientY);
    if (point === null) {
      return;
    }
    let start = editing.anchor.start;
    let end = editing.anchor.end;
    if (edge === 'start') {
      start = Math.max(0, Math.min(point, end - 1));
    } else {
      end = Math.max(start + 1, point);
    }
    const range = rangeFromOffsets(section, start, end);
    const quote = range ? range.toString().replace(/\s+/g, ' ').trim() : editing.anchor.quote;
    resizeEditing = {
      ...editing,
      anchor: createAnchor({ ...editing.anchor, start, end, quote }),
    };
    renderResizeHandles();
  };
  const up = () => {
    doc.removeEventListener('mousemove', move);
    doc.removeEventListener('mouseup', up);
    removeEventListener('mousemove', move);
    removeEventListener('mouseup', up);
    finishResize();
  };
  // Слушатели ставятся и на окно книги, и на её документ: протяжка может
  // начаться внутри книги, а закончиться за её пределами.
  doc.addEventListener('mousemove', move);
  doc.addEventListener('mouseup', up);
  addEventListener('mousemove', move);
  addEventListener('mouseup', up);
  return true;
}

/** Начало протяжки: по инструменту «текст»/«фигура» ставится якорь точки. */
function handlePointerDown(event: MouseEvent): void {
  // Правка границ важнее создания новой заметки.
  if (beginResizeDrag(event)) {
    return;
  }
  if (state.tool.type !== 'text' && state.tool.type !== 'shape') {
    return;
  }
  const target = event.target as Element | null;
  if (target?.closest?.(`mark.${NOTE_CLASS}, .${NOTE_OVERLAY_CLASS}`)) {
    return;
  }
  const section = chapterAt(bookDocument(), event.clientX, event.clientY);
  if (!section) {
    return;
  }
  const point = pointFraction(section, event.clientX, event.clientY);
  const chapter = Number((section as HTMLElement).dataset.chapter ?? '0');
  const anchor = createAnchor({
    kind: 'point',
    chapter: Number.isFinite(chapter) ? chapter : 0,
    x: point.x,
    y: point.y,
    percent: percentAt(event.clientY),
  });
  if (state.tool.type === 'text') {
    post({ type: 'text-point', value: { anchor, color: state.tool.color } });
    return;
  }
  // Фигура: две точки протяжки. Протяжка отслеживается до отпускания.
  const start = point;
  let end = point;
  const move = (moveEvent: MouseEvent) => {
    end = pointFraction(section, moveEvent.clientX, moveEvent.clientY);
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    const moved = Math.abs(end.x - start.x) > 0.005 || Math.abs(end.y - start.y) > 0.005;
    if (!moved) {
      return;
    }
    post({
      type: 'shape',
      value: {
        anchor,
        shape: state.tool.shape,
        geometry: serializeGeometry({ x1: start.x, y1: start.y, x2: end.x, y2: end.y }),
        color: state.tool.color,
      },
    });
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}

/** Захват опорной строки: позиция чтения не «прыгает» при перестройке. */
let zoomAnchor = captureAnchor(bookDocument());

/** Заметка, границы цитаты которой сейчас правятся. */
let resizeEditing: { noteId: string; anchor: QuoteAnchor; marker: Element | null } | null = null;

/** Маркеры границ цитаты: только у заметки в режиме правки. */
function clearResizeHandles(): void {
  for (const handle of Array.from(bookDocument().querySelectorAll('.context-note-handle'))) {
    handle.remove();
  }
}

/** Отрисовка маркеров границ цитаты внутри раздела главы. */
function renderResizeHandles(): void {
  clearResizeHandles();
  const editing = resizeEditing;
  const anchor = editing?.anchor;
  const section = anchor ? chapterSection(anchor.chapter) : null;
  if (!editing || !anchor || !section) {
    return;
  }
  const startRange = rangeFromOffsets(
    section,
    Math.max(0, anchor.start),
    Math.max(0, anchor.start + 1),
  );
  const endRange = rangeFromOffsets(section, Math.max(0, anchor.end - 1), Math.max(0, anchor.end));
  const startRect = rangeHandleRect(section, startRange, 'start');
  const endRect = rangeHandleRect(section, endRange, 'end');
  if (!startRect || !endRect) {
    return;
  }
  const doc = bookDocument();
  for (const [edge, rect] of [
    ['start', startRect],
    ['end', endRect],
  ] as const) {
    const handle = doc.createElement('div');
    handle.className = 'context-note-handle';
    handle.dataset.noteHandle = edge;
    const bounds = section.getBoundingClientRect();
    handle.style.left = `${rect.x + (edge === 'start' ? bounds.left : bounds.left + rect.width)}px`;
    handle.style.top = `${rect.y + bounds.top + rect.height / 2}px`;
    doc.body.appendChild(handle);
  }
}

/** Исполнение команды меню заметки. */
function runNoteMenuAction(noteId: string, action: string): void {
  const note = state.notes.find((candidate) => candidate.id === noteId);
  const anchor = note ? parseAnchor(note.anchor ?? '') : null;
  if (!note || !anchor) {
    return;
  }
  if (action === 'resize') {
    resizeEditing = { noteId, anchor, marker: null };
    renderResizeHandles();
  }
}

/** Смещение символа в главе по координатам указателя. */
function offsetAtPoint(section: Element, clientX: number, clientY: number): number | null {
  const doc = bookDocument() as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretRangeFromPoint;
  if (typeof caret !== 'function') {
    return null;
  }
  const range = caret.call(doc, clientX, clientY);
  if (!range) {
    return null;
  }
  const element = (node: Node) =>
    node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
  if (element(range.startContainer)?.closest(`.${CHAPTER_CLASS}`) !== section) {
    return null;
  }
  return charOffset(section, range.startContainer, range.startOffset);
}

/** Завершение правки границ: новый якорь уходит оболочке. */
function finishResize(): void {
  const editing = resizeEditing;
  resizeEditing = null;
  clearResizeHandles();
  if (editing) {
    post({
      type: 'place-note',
      value: {
        noteId: editing.noteId,
        anchor: editing.anchor,
      },
    });
  }
}

/** Начальная загрузка модуля. */
function start(): void {
  status.textContent = viewerText('opening');
  // Прокручивается документ книги: событие `scroll` приходит на окно, а не на
  // корневой элемент (он не получает его всплытием).
  addEventListener('scroll', () => {
    reportProgress();
    zoomAnchor = captureAnchor(bookDocument());
  }, { passive: true });
  document.addEventListener('mouseup', handleSelectionEnd);
  document.addEventListener('mousedown', handlePointerDown);
  document.addEventListener('selectionchange', () => {
    const selection = bookDocument().getSelection();
    const range =
      selection && !selection.isCollapsed && selection.rangeCount > 0
        ? selection.getRangeAt(0)
        : null;
    renderSelectionLayer(bookDocument(), range);
    // Снятие выделения закрывает меню оболочки: иначе оно осталось бы висеть
    // над пустым местом и создало заметку без якоря.
    if (!range) {
      post({ type: 'selection-cleared' });
    }
  });
  chaptersEl.addEventListener('click', handleClick);
  addEventListener('keydown', handleKeyDown);
  addEventListener('resize', () => {
    restoreAnchor(bookDocument(), zoomAnchor);
    zoomAnchor = captureAnchor(bookDocument());
    reportProgress();
  });
  addEventListener('message', handleMessage);
  document.body.dataset.tool = state.tool.type;
  post({ type: 'capabilities', value: { zoom: true, pages: false, selection: true, flowing: true } });
  post({ type: 'ready' });
}

start();

export { chapterTextOf, rangeFromOffsets, rangeHandleRect, clamp01, charOffset, parseGeometry };
export type { ViewerNote };
