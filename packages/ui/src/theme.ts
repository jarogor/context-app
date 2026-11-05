/** Тема оформления приложения: предпочтение пользователя и его применение.
 *
 * Владелец шва оформления — дизайн-система: токены существуют в светлом и
 * тёмном наборах, а активный набор выбирает атрибут `data-theme` на корне
 * документа. Модуль не знает о компонентах и о том, откуда пришло предпочтение:
 * его применяет оболочка, прочитав настройку.
 */

/** Предпочтение темы: явная светлая, явная тёмная или следование теме ОС. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Конкретная тема, применённая к документу. */
export type ResolvedTheme = 'light' | 'dark';

/** Функция снятия подписки на изменение темы ОС. */
export type UnsubscribeTheme = () => void;

/** Проверка, что значение является допустимым предпочтением темы. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/** Приведение произвольного значения к предпочтению темы.
 *
 * Неизвестное или отсутствующее значение трактуется как `system`, чтобы
 * некорректные данные не оставляли интерфейс без темы.
 */
export function normalizeThemePreference(value: unknown): ThemePreference {
  return isThemePreference(value) ? value : 'system';
}

/** Разрешение предпочтения в конкретную тему.
 *
 * `system` следует теме операционной системы; явные значения её игнорируют.
 */
export function resolveTheme(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return prefersDark ? 'dark' : 'light';
  }
  return preference;
}

/** Противоположная сторона темы.
 *
 * Переключатель в шапке ведёт только между явными сторонами: третьего
 * положения «как в системе» у кнопки нет — этот режим выбирают в настройках, а
 * нажатие кнопки всегда ставит противоположную явную сторону той, что сейчас
 * показана (в том числе когда интерфейс следует теме ОС).
 */
export function oppositeTheme(theme: ResolvedTheme): ResolvedTheme {
  return theme === 'dark' ? 'light' : 'dark';
}

/** Применение темы к корню документа.
 *
 * Устанавливает атрибут `data-theme` с разрешённой темой и, если предпочтение
 * `system`, следит за изменением темы операционной системы. Возвращает функцию
 * снятия подписки; для явных тем она ничего не делает.
 */
export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
  media: MediaQueryList = window.matchMedia('(prefers-color-scheme: dark)'),
): UnsubscribeTheme {
  const apply = () => {
    root.dataset.theme = resolveTheme(preference, media.matches);
  };
  apply();
  if (preference !== 'system') {
    return () => {};
  }
  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }
  media.addListener(apply);
  return () => media.removeListener(apply);
}
