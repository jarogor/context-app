/** Окно видимых вкладок панели рабочего места.
 *
 * Панель показывает не все вкладки, а непрерывный срез по фактической ширине:
 * число целиком помещающихся вкладок определяет окно, а остальные доступны
 * навигацией. Модуль хранит чистый расчёт окна, независимый от Svelte и DOM.
 */

/** Ширина слота вкладки в rem: весь элемент вкладки вместе с кнопками действий. */
export const TAB_SLOT_REM = 9;

/** Число вкладок, целиком помещающихся в доступной ширине.
 *
 * Ёмкость — не меньше одной вкладки: даже в очень узкой панели видна активная.
 */
export function visibleTabCount(availablePx: number, tabWidthPx: number): number {
  if (!Number.isFinite(availablePx) || !Number.isFinite(tabWidthPx) || tabWidthPx <= 0) {
    return 1;
  }
  return Math.max(1, Math.floor(availablePx / tabWidthPx));
}

/** Приведение начала окна к допустимому диапазону `[0, total - capacity]`. */
export function clampWindowStart(start: number, capacity: number, total: number): number {
  const maxStart = Math.max(0, total - Math.max(1, capacity));
  if (!Number.isFinite(start)) {
    return 0;
  }
  return Math.min(Math.max(0, Math.trunc(start)), maxStart);
}

/** Начало окна, при котором активная вкладка попадает в видимый диапазон.
 *
 * Если активная вкладка вне окна, окно сдвигается минимально — так, чтобы
 * вкладка оказалась у ближнего края; иначе начало окна не меняется.
 */
export function windowStartForActive(
  activeIndex: number,
  start: number,
  capacity: number,
  total: number,
): number {
  if (activeIndex < 0) {
    return clampWindowStart(start, capacity, total);
  }
  if (activeIndex < start) {
    return clampWindowStart(activeIndex, capacity, total);
  }
  if (activeIndex >= start + capacity) {
    return clampWindowStart(activeIndex - capacity + 1, capacity, total);
  }
  return clampWindowStart(start, capacity, total);
}
