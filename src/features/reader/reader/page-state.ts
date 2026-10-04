/** Постраничное состояние чтения: доля прогресса и границы перехода.
 *
 * Помощники чистые, чтобы нижняя панель страницы чтения оставалась тонкой, а
 * правила границ проверялись отдельно от разметки.
 */

/** Доля прочитанного в процентах по текущей странице и их числу. */
export function pageProgress(page: number, pages: number): number {
  if (!Number.isFinite(page) || !Number.isFinite(pages) || pages <= 1) {
    return 0;
  }
  const value = ((page - 1) / (pages - 1)) * 100;
  return Math.max(0, Math.min(100, value));
}

/** Ближайшая страница в допустимых границах `[1, pages]`. */
export function clampPage(page: number, pages: number | null): number {
  const upper = pages === null ? Number.POSITIVE_INFINITY : pages;
  const value = Math.trunc(page);
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(upper, value));
}

/** Признак возможности перехода на соседнюю страницу. */
export function canStepPage(page: number | null, pages: number | null, delta: number): boolean {
  if (page === null) {
    return false;
  }
  const next = page + delta;
  return next >= 1 && (pages === null || next <= pages);
}
