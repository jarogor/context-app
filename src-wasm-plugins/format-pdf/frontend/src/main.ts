/** Точка входа модуля рисования плагина формата чтения `format-pdf`.
 *
 * Связывает модули: разбирает сообщения приложения, открывает книгу, применяет
 * масштаб и тему, навешивает обработчики указателя, прокрутки и размера области.
 */
import { status, viewer, pagesEl } from './dom';
import { loadEngine } from './engine';
import {
  finishGesture,
  handlePagesClick,
  handlePagesPointerDown,
  handlePointerDown,
  handlePointerMove,
  handleSelectionChange,
  handleSelectionOrGesture,
} from './gestures';
import { closeNoteMenu, redrawAllNotes, startMove, startResize, stopEditing } from './note-ops';
import { noteById } from './notes';
import { decodeBase64, parseIncoming, post } from './protocol';
import {
  layoutPages,
  releasePage,
  renderPage,
  repaintDirtyPages,
  reportState,
  resizePages,
  scheduleWindowRefresh,
  startObserver,
  wakeViewerScroll,
} from './render';
import { gotoNote, gotoPage, handleScroll, pageAtTop, pageToEdge, scrollToFraction } from './navigation';
import { applyReaderTheme } from './theme';
import { state } from './state';
import { clampTextSelection, endTextSelection } from './text-selection';
import { resetSearchTexts, searchBook, stepSearch } from './search';

/** Открытие книги: загрузка движка, документа и построение каркаса страниц. */
async function openBook(data: string, position: number, zoomValue: number): Promise<void> {
  status.textContent = 'Открытие книги…';
  status.hidden = false;
  pagesEl.replaceChildren();
  // Предыдущая книга: освобождаем её холсты, иначе карта держала бы их.
  state.rendered.clear();
  state.pending.clear();
  state.renderEpoch += 1;
  resetSearchTexts();
  try {
    const lib = await loadEngine();
    state.doc = await lib.getDocument({ data: decodeBase64(data) }).promise;
    state.pageCount = state.doc.numPages;
    state.initialZoom = Number(zoomValue) || 100;
    state.zoom = state.initialZoom;
    const first = await state.doc.getPage(1);
    const firstBase = first.getViewport({ scale: 1 });
    state.naturalSizes = new Array(state.pageCount).fill({
      width: firstBase.width,
      height: firstBase.height,
    });
    layoutPages();
    startObserver();
    status.hidden = true;
    scrollToFraction(position);
    state.currentPage = pageAtTop();
    reportState();
  } catch (error) {
    status.textContent = 'Не удалось отобразить книгу: ' + error;
    post({ type: 'error', message: String(error) });
  }
}

/** Применение масштаба с удержанием опорной страницы на месте. */
function applyZoom(value: number): void {
  if (!state.doc) {
    return;
  }
  const next = Number(value) || 100;
  if (next === state.zoom) {
    return;
  }
  const anchorEl = pagesEl.children[state.currentPage - 1] as HTMLElement | undefined;
  const offsetBefore = anchorEl ? anchorEl.offsetTop - viewer.scrollTop : 0;
  state.zoom = next;
  // Смена масштаба отменяет незавершённые отрисовки: иначе они завершатся в старом
  // масштабе и оставят страницу белой.
  state.renderEpoch += 1;
  resizePages();
  for (const node of pagesEl.children) {
    releasePage(node as HTMLElement);
  }
  for (const node of pagesEl.children) {
    const pageEl = node as HTMLElement;
    const rect = pageEl.getBoundingClientRect();
    if (rect.bottom > -1200 && rect.top < window.innerHeight + 1200) {
      void renderPage(pageEl);
    }
  }
  if (anchorEl) {
    viewer.scrollTop = anchorEl.offsetTop - offsetBefore;
  }
  reportState();
}

/** Перерисовка при смене плотности экрана (перемещение между мониторами). */
function handleRatioChange(): void {
  const ratio = window.devicePixelRatio || 1;
  if (ratio === state.lastRatio) {
    return;
  }
  state.lastRatio = ratio;
  state.renderEpoch += 1;
  for (const node of pagesEl.children) {
    releasePage(node as HTMLElement);
  }
  for (const node of pagesEl.children) {
    const pageEl = node as HTMLElement;
    const rect = pageEl.getBoundingClientRect();
    if (rect.bottom > -1200 && rect.top < window.innerHeight + 1200) {
      void renderPage(pageEl);
    }
  }
}

/** Пересчёт окон при изменении области просмотра (панели, размер окна). */
function handleViewerResize(): void {
  if (
    viewer.clientWidth === state.lastViewerWidth &&
    viewer.clientHeight === state.lastViewerHeight
  ) {
    return;
  }
  state.lastViewerWidth = viewer.clientWidth;
  state.lastViewerHeight = viewer.clientHeight;
  scheduleWindowRefresh();
}

/** Обработка сообщений приложения. */
async function handleMessage(event: MessageEvent): Promise<void> {
  const message = parseIncoming(event.data);
  if (!message) {
    return;
  }
  switch (message.type) {
    case 'open':
      await openBook(message.data, message.position, message.zoom);
      break;
    case 'zoom':
      applyZoom(message.value);
      break;
    case 'goto': {
      // Переход к заметке из списка закрывает меню и правку прежней заметки.
      closeNoteMenu();
      stopEditing();
      const value = message.value || {};
      let anchor: { page?: number } | null = null;
      if (typeof value.anchor === 'string') {
        try {
          anchor = JSON.parse(value.anchor) as { page?: number };
        } catch (error) {
          anchor = null;
        }
      }
      if (typeof value.noteId === 'string' && value.noteId) {
        // Сперва страница заметки (нужно для неотрисованных страниц), затем
        // прокрутка к самой заметке.
        if (anchor && anchor.page) {
          gotoPage(anchor.page);
        }
        gotoNote(value.noteId);
      } else if (typeof value.page === 'number') {
        gotoPage(value.page);
      } else if (anchor && anchor.page) {
        gotoPage(anchor.page);
      }
      break;
    }
    case 'note-menu-action': {
      // Команда меню оболочки: перемещение заметки или правка границ цитаты.
      const value = message.value || {};
      const note = value.noteId ? noteById(state.notes, value.noteId) : null;
      closeNoteMenu();
      if (!note) {
        break;
      }
      if (value.action === 'move') {
        startMove(note);
      } else if (value.action === 'resize') {
        startResize(note, state.notes);
      }
      break;
    }
    case 'notes':
      state.notes = message.value;
      redrawAllNotes(state.notes);
      break;
    case 'tool':
      // Смена инструмента закрывает меню и правку заметки.
      closeNoteMenu();
      stopEditing();
      state.tool = message.value;
      document.body.dataset.tool = state.tool.type;
      break;
    case 'reader-theme': {
      const applied = applyReaderTheme(message.value);
      state.readerTheme = applied.theme;
      state.paintKey = applied.paintKey;
      state.pageColors = applied.pageColors;
      repaintDirtyPages();
      redrawAllNotes(state.notes);
      break;
    }
    case 'show':
      // Область чтения снова видима: довести отрисовку под текущую раскраску.
      wakeViewerScroll();
      repaintDirtyPages();
      break;
    case 'search':
      await searchBook(message.value.query ?? '');
      break;
    case 'search-step':
      stepSearch(message.value.delta === -1 ? -1 : 1);
      break;
  }
}
/** Навешивание обработчиков указателя, прокрутки, выделения и размера. */
function bindEvents(): void {
  viewer.addEventListener('scroll', handleScroll, { passive: true });
  viewer.addEventListener('mouseup', handleSelectionOrGesture);
  viewer.addEventListener('pointerdown', handlePointerDown);
  pagesEl.addEventListener('pointerdown', handlePagesPointerDown);
  pagesEl.addEventListener('pointermove', handlePointerMove);
  pagesEl.addEventListener('pointerup', finishGesture);
  pagesEl.addEventListener('pointercancel', finishGesture);
  // Протяжка выделения заканчивается вместе с нажатием: ограничение слоя
  // снимается, иначе следующее нативное выделение (Ctrl+A, меню) обрезалось бы.
  pagesEl.addEventListener('pointerup', endTextSelection);
  pagesEl.addEventListener('pointercancel', endTextSelection);
  viewer.addEventListener('mouseup', endTextSelection);
  document.addEventListener('selectionchange', clampTextSelection);
  document.addEventListener('selectionchange', handleSelectionChange);
  /* Клик по заметке: приложение выбирает её, а вьюер показывает меню действий. */
  pagesEl.addEventListener('click', handlePagesClick);
  addEventListener('keydown', handleKeyDown);
  addEventListener('resize', handleRatioChange);
  addEventListener('resize', handleViewerResize);
  new ResizeObserver(() => {
    if (viewer.clientWidth > 0 && viewer.clientHeight > 0) {
      scheduleWindowRefresh();
    }
  }).observe(viewer);
}

/**
 * Обработка клавиш навигации по книге.
 *
 * `Home`/`End` прокручивают книгу к началу или концу, `PageUp`/`PageDown` —
 * на высоту области чтения (листание экранами). Клавиши сами управляют
 * `scrollTop`, а не полагаются на прокрутку браузера: иначе после ручного
 * перехода к краю следующая клавиша игнорировалась бы. Поля ввода клавиши не
 * перехватывают, чтобы правка номера страницы работала как обычно.
 */
function handleKeyDown(event: KeyboardEvent): void {
  if (!state.doc || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const target = event.target as HTMLElement | null;
  if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))) {
    return;
  }
  const height = viewer.clientHeight;
  switch (event.key) {
    case 'Home':
      pageToEdge('start');
      break;
    case 'End':
      pageToEdge('end');
      break;
    case 'PageUp':
      viewer.scrollTop = Math.max(0, viewer.scrollTop - height);
      handleScroll();
      break;
    case 'PageDown':
      viewer.scrollTop = viewer.scrollTop + height;
      handleScroll();
      break;
    default:
      return;
  }
  event.preventDefault();
}

/** Начальная загрузка модуля рисования. */
function start(): void {
  state.lastRatio = window.devicePixelRatio || 1;
  state.lastViewerWidth = viewer.clientWidth;
  state.lastViewerHeight = viewer.clientHeight;
  bindEvents();
  addEventListener('message', (event) => {
    void handleMessage(event);
  });
  post({ type: 'capabilities', value: { zoom: true, pages: true, selection: true } });
  post({ type: 'ready' });
}

start();
