/** Активный язык интерфейса как реактивное состояние.
 *
 * Выбор языка делает приложение при загрузке и при смене настройки, а тексты
 * читают его через `currentLocale`. Состояние объявлено руной Svelte, поэтому
 * компонент, вызвавший `t()` в шаблоне, перерисовывается при смене языка.
 */

import { DEFAULT_LOCALE, normalizeLocale, type Locale } from './locale';

/** Текущий язык интерфейса. */
let locale = $state<Locale>(DEFAULT_LOCALE);

/** Текущий язык интерфейса. */
export function currentLocale(): Locale {
  return locale;
}

/** Смена языка интерфейса. */
export function setLocale(next: unknown): void {
  locale = normalizeLocale(next);
}
