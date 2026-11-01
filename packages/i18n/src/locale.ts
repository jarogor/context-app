/** Язык интерфейса и его применение к документу.
 *
 * Владелец выбора языка — приложение: язык хранится в настройках, читается на
 * бутстрапе и применяется к документу (`lang` и `data-locale`). Модуль не знает
 * о компонентах: тексты берутся из словарей по ключу, а активный язык читает
 * `translate`.
 */

/** Поддерживаемый язык интерфейса. */
export type Locale = 'ru' | 'en';

/** Язык по умолчанию: до явного выбора интерфейс русский. */
export const DEFAULT_LOCALE: Locale = 'ru';

/** Все поддерживаемые языки в порядке показа в настройках. */
export const LOCALES: readonly Locale[] = ['ru', 'en'];

/** Проверка, что значение — поддерживаемый язык. */
export function isLocale(value: unknown): value is Locale {
    return LOCALES.includes(value as Locale);
}

/** Приведение произвольного значения к поддерживаемому языку.
 *
 * Неизвестное или отсутствующее значение трактуется как язык по умолчанию,
 * чтобы некорректные данные не оставляли интерфейс без текстов.
 */
export function normalizeLocale(value: unknown): Locale {
    return isLocale(value) ? value : DEFAULT_LOCALE;
}

/** Код языка для `Intl` (локаль форматирования дат и чисел). */
export function localeTag(locale: Locale = DEFAULT_LOCALE): string {
    return locale === 'en' ? 'en-US' : 'ru-RU';
}

/** Применение языка к корню документа.
 *
 * `lang` нужен экранным дикторам и переносам, `data-locale` — оформлению и
 * тестам. Атрибуты живут на корне, как тема и палитра.
 */
export function applyLocale(locale: Locale, root: HTMLElement = document.documentElement): void {
    root.lang = locale;
    root.dataset.locale = locale;
}
