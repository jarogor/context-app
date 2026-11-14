/** Раскладка боковых панелей области чтения.
 *
 * Панель либо стоит рядом с книгой, либо накрывает её. Решение принимается по
 * ширине **самой области**, а не окна: широкое окно с двумя открытыми панелями
 * оставляет книге ту же узкую полоску, что и маленькое. Выбор по окну — причина
 * тому, что панель на широком экране продолжает отнимать место у текста.
 *
 * Правило одно: рядом с книгой должно остаться не меньше
 * `READER_COLUMN_MIN_REM` — иначе панель накрывает содержимое. Панели
 * учитываются по очереди, поэтому при нехватке места поверх уходит последняя,
 * а первая остаётся рядом: одна читаемая колонка лучше двух накладных панелей.
 */

/** Наименьшая ширина колонки текста в rem; совпадает с токеном `--reader-column-min`. */
export const READER_COLUMN_MIN_REM = 32;

/** Ширина боковой панели в rem по умолчанию; совпадает с `--notes-panel-width`. */
export const PANEL_WIDTH_REM = 20;

/**
 * Признаки «панель накрывает содержимое» для панелей в порядке слева направо.
 *
 * @param rowWidthPx Ширина области рабочего места в пикселях.
 * @param rootFontPx Корневой кегль: ширины заданы в rem и растут с масштабом.
 * @param widthsRem Ширины панелей в rem в порядке показа.
 * @returns Для каждой панели — `true`, если она накрывает книгу.
 */
export function panelOverlayFlags(
  rowWidthPx: number,
  rootFontPx: number,
  widthsRem: readonly number[],
): boolean[] {
  if (!(rowWidthPx > 0) || !(rootFontPx > 0)) {
    return widthsRem.map(() => false);
  }
  const min = READER_COLUMN_MIN_REM * rootFontPx;
  let used = 0;
  return widthsRem.map((widthRem) => {
    const width = widthRem * rootFontPx;
    if (rowWidthPx - used - width >= min) {
      used += width;
      return false;
    }
    return true;
  });
}
