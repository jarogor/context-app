/** Точка входа модуля рисования плагина формата чтения `format-djvu`.
 *
 * Связывает модули: разбирает сообщения приложения, открывает книгу, применяет
 * масштаб и тему, навешивает обработчики указателя, прокрутки и размера области.
 */
import { status, viewer, pagesEl } from './dom';
import { loadEngine, openDocument } from './engine';
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
  naturalPageSize,
  offsetOfPage,
  releaseWindowPages,
  repaintDirtyPages,
  reportState,
  resizePages,
  scheduleWindowRefresh,
  settleRender,
  wakeViewerScroll,
} from './render';
import { centerHorizontally, gotoNote, gotoPage, handleScroll, pageAtTop, pageToEdge, scrollToFraction } from './navigation';import { applyReaderTheme } from './theme';
import { state } from './state';

/** Открытие книги: загрузка движка, документа и построение каркаса страниц. */
async function openBook(data: string, position: number, zoomValue: number): Promise<void> {
  status.textContent = 'Открытие книги…';
  status.hidden = false;
  pagesEl.replaceChildren();
  // Предыдущая книга: освобождаем её холсты, иначе карта держала бы их.
  state.rendered.clear();
  state.pending.clear();
  try {
    state.module = await loadEngine();
    state.doc = openDocument(state.module, decodeBase64(data));
    state.pageCount = state.doc.page_count();
    // Размеры читаются лениво: у книги на тысячи страниц разбор всех сразу
    // занял бы секунды. Первая страница задаёт размер по умолчанию — она же
    // видна при открытии.
    state.naturalSizes = new Array(state.pageCount);
    state.defaultSize = naturalPageSize(state.doc.page(0));
    state.naturalSizes[0] = state.defaultSize;
    // Как в PDF: 100 % — абсолютный естественный размер страницы файла.
    state.initialZoom = Number(zoomValue) || 100;
    state.zoom = state.initialZoom;
    layoutPages();
    scheduleWindowRefresh();
    status.hidden = true;
    scrollToFraction(position);
    centerHorizontally();
    state.currentPage = pageAtTop();
    reportState();
  } catch (error) {
    status.textContent = 'Не удалось отобразить книгу: ' + error;
    post({ type: 'error', message: String(error) });
  }
}

/** Применение масштаба с удержанием опорной страницы на месте.
 *
 * Склейки серии нажатий здесь нет: её делает общий слой чтения
 * (`ReaderPage`), потому что кнопки масштаба общие для всех форматов. Плагин
 * получает уже окончательное значение серии.
 */
function applyZoom(value: number): void {
  if (!state.doc) {
    return;
  }
  const next = Number(value) || 100;
  if (next === state.zoom) {
    return;
  }
  const anchorPage = state.currentPage;
  const offsetBefore = offsetOfPage(anchorPage) - viewer.scrollTop;
  state.zoom = next;
  // Смена масштаба пересчитывает виртуальную раскладку и сбрасывает растры
  // окна: перерисовываются только его страницы. Прежний растр остаётся видимым
  // до готовности нового, поэтому пустой страницы на время отрисовки нет.
  releaseWindowPages();
  resizePages();
  viewer.scrollTop = offsetOfPage(anchorPage) - offsetBefore;
  // Размер области после смены содержимого не менялся: запоминаем его, чтобы
  // `ResizeObserver` не запустил пересчёт второй раз на то же изменение.
  state.lastViewerWidth = viewer.clientWidth;
  state.lastViewerHeight = viewer.clientHeight;
  settleRender();
  reportState();
}

/** Перерисовка при смене плотности экрана (перемещение между мониторами). */
function handleRatioChange(): void {
  const ratio = window.devicePixelRatio || 1;
  if (ratio === state.lastRatio) {
    return;
  }
  state.lastRatio = ratio;
  releaseWindowPages();
  scheduleWindowRefresh();
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
  // Размер страницы не зависит от окна: пересчитываются только канвасы.
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
  document.addEventListener('selectionchange', handleSelectionChange);
  /* Клик по заметке: приложение выбирает её, а вьюер показывает меню действий. */
  pagesEl.addEventListener('click', handlePagesClick);
  addEventListener('keydown', handleKeyDown);
  addEventListener('resize', handleRatioChange);
  addEventListener('resize', handleViewerResize);
  new ResizeObserver(() => {
    if (viewer.clientWidth > 0 && viewer.clientHeight > 0) {
      handleViewerResize();
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
