/** Единое форматирование значений для списков областей.
 *
 * Формат даты следует выбранному языку интерфейса: русский — `ДД.ММ.ГГГГ чч:мм`
 * (двухзначные день, месяц, час и минута, 24-часовой формат), английский —
 * `ММ/ДД/ГГГГ чч:мм AM` (12-часовой формат). Сам расчёт принадлежит пакету
 * `@context/i18n`, чтобы порядок частей и подписи жили в одном месте; оболочка
 * лишь передаёт текущий язык.
 *
 * Формат задаётся вручную, а не локалью окружения: системная локаль (например,
 * en-US на русском интерфейсе) давала бы чужой порядок частей.
 */

import { currentLocale, formatDateTimeFor, formatTimeFor, type Locale } from '@context/i18n';

/** Дата и время в формате языка; ноль даёт пустую строку.
 *
 * Язык по умолчанию — активный: вызов в разметке создаёт зависимость от него,
 * поэтому смена языка перерисовывает даты вместе с текстами.
 */
export function formatDateTime(millis: number, locale: Locale = currentLocale()): string {
  return formatDateTimeFor(locale, millis);
}

/** Время в формате языка; ноль даёт пустую строку. */
export function formatTime(millis: number, locale: Locale = currentLocale()): string {
  return formatTimeFor(locale, millis);
}

/** Размер в байтах в человекочитаемом виде.
 *
 * Единицы — общие для всех языков (`Б`, `КБ`, `МБ`, `ГБ`): это сокращения,
 * которые читаются одинаково, и отдельная таблица переводов для них не нужна.
 * Дробная часть показывается только у мелких единиц — крупные значения удобнее
 * целыми.
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}
