/** Единое форматирование значений для интерфейса с учётом языка.
 *
 * Формат даты следует выбранному языку: русский — `ДД.ММ.ГГГГ чч:мм`
 * (двухзначные день, месяц, час и минута), английский — `ММ/ДД/ГГГГ чч:мм`
 * (12-часовой формат с AM/PM). Формат задаётся вручную, а не локалью
 * окружения: системная локаль (например, en-US на русском интерфейсе) давала бы
 * чужой порядок частей.
 */

/** Двухзначное число с ведущим нулём. */
function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Дата и время по-русски: `ДД.ММ.ГГГГ чч:мм`; ноль даёт пустую строку. */
function formatRussianDateTime(date: Date): string {
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Дата и время по-английски: `ММ/ДД/ГГГГ чч:мм AM`; ноль даёт пустую строку. */
function formatEnglishDateTime(date: Date): string {
  const hours = date.getHours();
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(date.getMonth() + 1)}/${pad(date.getDate())}/${date.getFullYear()} ${pad(
    hour12,
  )}:${pad(date.getMinutes())} ${period}`;
}

/** Дата и время в формате языка; ноль даёт пустую строку. */
export function formatDateTimeFor(locale: 'ru' | 'en', millis: number): string {
  if (!millis) {
    return '';
  }
  const date = new Date(millis);
  return locale === 'en' ? formatEnglishDateTime(date) : formatRussianDateTime(date);
}

/** Время по-русски в 24-часовом формате `чч:мм:сс`; ноль даёт пустую строку. */
function formatRussianTime(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

/** Время по-английски в 12-часовом формате `чч:мм:сс AM`; ноль даёт пустую строку. */
function formatEnglishTime(date: Date): string {
  const hours = date.getHours();
  const period = hours < 12 ? 'AM' : 'PM';
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${pad(hour12)}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${period}`;
}

/** Время в формате языка; ноль даёт пустую строку. */
export function formatTimeFor(locale: 'ru' | 'en', millis: number): string {
  if (!millis) {
    return '';
  }
  const date = new Date(millis);
  return locale === 'en' ? formatEnglishTime(date) : formatRussianTime(date);
}
