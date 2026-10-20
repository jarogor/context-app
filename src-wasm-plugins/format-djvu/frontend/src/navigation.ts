/** Навигация по книге: текущая страница, переходы и вспышка заметки.
 *
 * Прокрутка к доле книги, к странице и к самой заметке; вспышка заметки при
 * переходе из списка повторяется, пока её элемент не появится (страница при
 * переходе может ещё отрисовываться).
 */
import { viewer } from './dom';
import {
  currentListHeight,
  notifyScrolling,
  offsetOfPage,
  reportState,
  scheduleWindowRefresh,
} from './render';
import { pageAtOffset } from './list';
import { showMoveGuide } from './note-ops';
import { editor } from './editing-state';
import { state } from './state';

/** Страница, находящаяся у верха области чтения. */
export function pageAtTop(): number {
  return pageAtOffset(viewer.scrollTop);
}

/** Обновление текущей страницы и прогресса после прокрутки. */
export function handleScroll(): void {
  if (!state.doc || state.scrollScheduled) {
    return;
  }
  state.scrollScheduled = true;
  requestAnimationFrame(() => {
    state.scrollScheduled = false;
    const page = pageAtTop();
    if (page !== state.currentPage) {
      state.currentPage = page;
    }
    reportState();
    notifyScrolling();
    if (editor.moveGuide) {
      showMoveGuide();
    }
  });
}

/** Прокрутка к доле книги в процентах (высота списка виртуальная). */
export function scrollToFraction(percent: number): void {
  const max = currentListHeight() - viewer.clientHeight;
  viewer.scrollTop = max * (Math.max(0, Math.min(100, percent)) / 100);
}

/** Центрирование книги по горизонтали в области чтения.
 *
 * Страница шире области чтения переполняет список вправо, и при открытии её
 * левый край оказывается у левой границы, а середина — за экраном. Прокрутка
 * ставится на середину переполнения, поэтому книга видна по центру.
 */
export function centerHorizontally(): void {
  const max = viewer.scrollWidth - viewer.clientWidth;
  viewer.scrollLeft = max > 0 ? Math.round(max / 2) : 0;
}

/** Прокрутка к странице (постраничный режим помещает её в область видимости). */
export function gotoPage(page: number): void {
  const target = Math.max(1, Math.min(state.pageCount, Math.trunc(page)));
  viewer.scrollTop = offsetOfPage(target);
  state.currentPage = target;
  scheduleWindowRefresh();
  reportState();
}

/**
 * Прокрутка к началу или концу книги клавишами `Home`/`End`.
 *
 * Прокрутка выполняется напрямую (`scrollTop`), а не `scrollIntoView`: после
 * ручной прокрутки к краю браузер не должен «застревать» на последней цели
 * `scrollIntoView`, из-за чего следующая клавиша не срабатывала. `End` ставит
 * прокрутку в самый низ (конец последней страницы), `Home` — в самое начало.
 */
export function pageToEdge(edge: 'start' | 'end'): void {
  const max = currentListHeight() - viewer.clientHeight;
  viewer.scrollTop = edge === 'start' ? 0 : Math.max(0, max);
  const page = pageAtTop();
  if (page !== state.currentPage) {
    state.currentPage = page;
  }
  reportState();
  scheduleWindowRefresh();
}

/** Прокрутка к самой заметке: её полоса оказывается у верха области.
 *
 * Прокрутка идёт к элементу заметки, а не к началу страницы: при увеличенной
 * странице цитата внизу страницы иначе оставалась бы за экраном. Заметка может
 * быть ещё не нарисована (страница при переходе рендерится заново) — тогда
 * прокрутка повторяется, пока элемент не появится. Направление прокрутки
 * учитывается, чтобы область чтения смещалась именно в сторону заметки.
 */
export function gotoNote(noteId: string | undefined, attempt = 0): void {
  if (!noteId) {
    return;
  }
  const element = document.querySelector(`[data-note-id="${noteId}"]`);
  const pageEl = element ? (element.closest('.page') as HTMLElement | null) : null;
  if (!element || !pageEl) {
    if (attempt < 40) {
      setTimeout(() => gotoNote(noteId, attempt + 1), 50);
    }
    return;
  }
  const viewerBounds = viewer.getBoundingClientRect();
  const target =
    element.classList.contains('note-shape')
      ? element.querySelector('line,rect,ellipse') || element
      : element;
  const bounds = target.getBoundingClientRect();
  // Полоса заметки — на строку ниже верха области: она видна, но над ней
  // остаётся контекст соседних строк.
  const offset = Math.round(bounds.height);
  const delta = bounds.top - viewerBounds.top - offset;
  if (delta !== 0) {
    viewer.scrollTop += delta;
  }
  const page = Number(pageEl.dataset.page);
  if (Number.isFinite(page)) {
    state.currentPage = page;
    reportState();
  }
  scheduleWindowRefresh();
  flashNote(noteId);
}

/** Вспышка заметки при переходе из списка.
 *
 * Заметка может быть ещё не нарисована: страница при переходе рендерится заново.
 * Тогда вспышка повторяется, пока её элемент не появится, иначе мигала бы сама
 * страница, а не заметка.
 */
export function flashNote(noteId: string | undefined, attempt = 0): void {
  if (!noteId) {
    return;
  }
  const elements = document.querySelectorAll(`[data-note-id="${noteId}"]`);
  if (elements.length === 0) {
    if (attempt < 40) {
      setTimeout(() => flashNote(noteId, attempt + 1), 50);
    }
    return;
  }
  for (const element of elements) {
    (element as HTMLElement).dataset.flash = 'true';
    setTimeout(() => {
      delete (element as HTMLElement).dataset.flash;
    }, 300);
  }
}
