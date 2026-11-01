/** Тексты модуля рисования плагина формата чтения `format-pdf`.
 *
 * Модуль самостоятелен: он не делит код и сборку с приложением-оболочкой,
 * поэтому держит собственный небольшой словарь и получает выбранный язык
 * сообщением `reader-locale`. Словарь покрывает только то, что модуль
 * показывает сам: состояние загрузки и сообщение об ошибке. Тексты меню,
 * панелей и заметок рисует оболочка, и они приходят уже переведёнными.
 */

/** Поддерживаемый язык интерфейса. */
export type ViewerLocale = 'ru' | 'en';

/** Тексты модуля по языку. */
interface Messages {
  /** Открытие книги. */
  opening: string;
  /** Ошибка открытия книги (перед текстом ошибки). */
  openFailed: string;
}

/** Словарь модуля. */
const MESSAGES: Record<ViewerLocale, Messages> = {
  ru: {
    opening: 'Открытие книги…',
    openFailed: 'Не удалось отобразить книгу: ',
  },
  en: {
    opening: 'Opening the book…',
    openFailed: 'Could not display the book: ',
  },
};

/** Текущий язык модуля: русский, пока приложение не сообщило иной. */
let locale: ViewerLocale = 'ru';

/** Приведение значения к поддерживаемому языку. */
export function normalizeViewerLocale(value: unknown): ViewerLocale {
  return value === 'en' ? 'en' : 'ru';
}

/** Смена языка модуля. */
export function setViewerLocale(value: unknown): void {
  locale = normalizeViewerLocale(value);
}

/** Текущий язык модуля. */
export function viewerLocale(): ViewerLocale {
  return locale;
}

/** Текст по ключу на текущем языке модуля. */
export function viewerText(key: keyof Messages): string {
  return MESSAGES[locale][key];
}
