/** Механизм интернационализации интерфейса «Контекста».
 *
 * Пакет держит поддерживаемые языки, активный язык как реактивное состояние,
 * словари текстов и форматирование значений по языку. Он не знает ни об
 * областях приложения, ни о настройках: выбор языка принадлежит приложению, а
 * пакет лишь применяет его к текстам.
 */

export {
  applyLocale,
  DEFAULT_LOCALE,
  isLocale,
  LOCALES,
  localeTag,
  normalizeLocale,
  type Locale,
} from './locale';
export { currentLocale, setLocale } from './locale.svelte';
export {
  RU,
  type Dictionary,
  type Message,
  type MessageKey,
  type MessageParams,
  type PluralForms,
} from './messages';
export { interpolate, isMessageKey, localize, pluralForm, t, translate } from './translate';
export { formatDateTimeFor, formatTimeFor } from './format';
export { en } from './dict/en';
export { ru } from './dict/ru';
