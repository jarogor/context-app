/** Отложенный запуск поиска по книге при наборе запроса.
 *
 * Модуль чист от Svelte и DOM: он решает, когда поиск запускать. Поиск по всему
 * тексту книги стоит заметной работы (обход глав или страниц), поэтому на каждую
 * набранную букву он не запускается: запрос копится, поиск идёт после затишья
 * набора. Слишком короткий запрос (одна буква) не ищется вовсе — он даёт
 * десятки тысяч вхождений и не помогает найти нужное место.
 */

/** Наименьшая осмысленная длина запроса, в символах. */
export const SEARCH_MIN_LENGTH = 2;

/** Пауза затишья набора, после которой поиск запускается, мс. */
export const SEARCH_DEBOUNCE_MS = 250;

/** Параметры планировщика поиска. */
export interface SearchSchedulerOptions {
  /** Пауза затишья набора, мс. */
  delay?: number;
  /** Наименьшая длина запроса; короче — поиск не запускается. */
  minLength?: number;
  /** Запуск поиска с готовым (обрезанным) запросом. */
  run: (query: string) => void;
  /** Запрос стал слишком коротким: результат прежнего поиска снимается. */
  onReset?: () => void;
}

/** Планировщик поиска. */
export interface SearchScheduler {
  /** Новое значение поля запроса. */
  change: (query: string) => void;
  /** Немедленный запуск накопленного запроса; `true` — поиск запущен. */
  flush: () => boolean;
  /** Отмена отложенного запуска без поиска (закрытие панели). */
  cancel: () => void;
}

/** Создание планировщика поиска. */
export function createSearchScheduler(options: SearchSchedulerOptions): SearchScheduler {
  const delay = options.delay ?? SEARCH_DEBOUNCE_MS;
  const minLength = options.minLength ?? SEARCH_MIN_LENGTH;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending = '';

  const stop = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const commit = (): void => {
    timer = null;
    const query = pending;
    pending = '';
    if (query.length >= minLength) {
      options.run(query);
    }
  };

  return {
    change(query: string): void {
      const trimmed = query.trim();
      if (trimmed.length < minLength) {
        stop();
        pending = '';
        options.onReset?.();
        return;
      }
      pending = trimmed;
      stop();
      timer = setTimeout(commit, delay);
    },
    flush(): boolean {
      if (timer === null) {
        return false;
      }
      stop();
      commit();
      return true;
    },
    cancel(): void {
      stop();
      pending = '';
    },
  };
}
