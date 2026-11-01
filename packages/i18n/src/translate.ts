/** Перевод текста по ключу и подстановка параметров.
 *
 * `translate` читает активный язык из реактивного состояния, поэтому вызов в
 * шаблоне компонента создаёт зависимость и текст перерисовывается при смене
 * языка. Тексты с числом выбирают форму по правилам языка.
 */

import { currentLocale } from './locale.svelte';
import type { Locale } from './locale';
import type { Dictionary, Message, MessageKey, MessageParams, PluralForms } from './messages';
import { en } from './dict/en';
import { RU } from './messages';

/** Словари по языку. */
const DICTIONARIES: Record<Locale, Dictionary> = {
  ru: RU,
  en,
};

/** Форма множественного числа для числа по правилам языка.
 *
 * Русский различает one (1, 21…), few (2–4, 22–24…), many (0, 5–20, 25…30…)
 * и other для дробных; английский — только one и other.
 */
export function pluralForm(locale: Locale, count: number): keyof PluralForms {
  const value = Math.abs(count);
  const integer = Number.isInteger(value);
  if (locale === 'ru') {
    if (!integer) {
      return 'other';
    }
    const mod10 = value % 10;
    const mod100 = value % 100;
    if (mod10 === 1 && mod100 !== 11) {
      return 'one';
    }
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
      return 'few';
    }
    return 'many';
  }
  return integer && value === 1 ? 'one' : 'other';
}

/** Выбор текста из сообщения с учётом числа. */
function pick(message: Message, locale: Locale, count: number | undefined): string {
  if (typeof message === 'string') {
    return message;
  }
  if (count === undefined) {
    return message.other;
  }
  const form = pluralForm(locale, count);
  if (form === 'few' && message.few === undefined) {
    return message.other;
  }
  if (form === 'many' && message.many === undefined) {
    return message.other;
  }
  if (form === 'one' && message.one === undefined) {
    return message.other;
  }
  return message[form] ?? message.other;
}

/** Подстановка параметров вида `{name}` в текст.
 *
 * Отсутствующий параметр остаётся как есть: лучше показать `{name}`, чем
 * потерять часть фразы молча.
 */
export function interpolate(text: string, params: MessageParams = {}): string {
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/** Перевод текста по ключу на указанный язык (по умолчанию — активный).
 *
 * `count` задаёт число для множественной формы и одновременно доступен как
 * параметр `{count}`.
 */
export function translate(
  key: MessageKey,
  params: MessageParams = {},
  locale: Locale = currentLocale(),
): string {
  const message = DICTIONARIES[locale][key] ?? RU[key] ?? key;
  const count = typeof params.count === 'number' ? params.count : undefined;
  return interpolate(pick(message, locale, count), params);
}

/** Короткий псевдоним перевода для шаблонов и вычислимых значений. */
export const t = translate;

/** Проверка, что строка — известный ключ текста.
 *
 * Нужна текстам, приходящим извне (декларации плагинов): если плагин назвал
 * заголовок ключом словаря, хост переводит его, а произвольную строку
 * оставляет как есть.
 */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && Object.hasOwn(RU, value);
}

/** Перевод строки, если она ключ словаря; иначе строка возвращается как есть. */
export function localize(value: string, params: MessageParams = {}): string {
  return isMessageKey(value) ? translate(value, params) : value;
}
