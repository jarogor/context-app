/** Тексты плагина, которые он показывает сам.
 *
 * Интерфейс принадлежит приложению, поэтому плагин показывает только своё
 * состояние загрузки и ошибку. Язык приходит сообщением `reader-locale`, а
 * словарь — свой, чтобы плагин не зависел от пакетов оболочки.
 */

/** Словарь плагина. */
const DICTIONARY: Record<string, Record<string, string>> = {
  ru: {
    opening: 'Открытие книги…',
    openFailed: 'Не удалось открыть книгу: ',
    footnoteBack: 'Вернуться к месту чтения',
  },
  en: {
    opening: 'Opening the book…',
    openFailed: 'Failed to open the book: ',
    footnoteBack: 'Back to the reading position',
  },
};

/** Текущий язык плагина. */
let locale = 'ru';

/** Смена языка плагина. */
export function setViewerLocale(value: string): void {
  locale = value in DICTIONARY ? value : 'ru';
}

/** Текст по ключу для текущего языка. */
export function viewerText(key: string): string {
  return DICTIONARY[locale]?.[key] ?? DICTIONARY.ru[key] ?? key;
}
