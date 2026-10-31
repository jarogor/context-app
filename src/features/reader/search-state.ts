/** Состояние поиска по книге, общее для встроенного чтения и плагинов форматов.
 *
 * Поиск выполняет та сторона, которая владеет текстом книги: встроенное чтение
 * ищет по главам документа, плагин формата — по текстовому слою страниц.
 * Оболочке для панели поиска нужно одно и то же: сколько найдено, к какому
 * вхождению ведёт переход и не обрезан ли список.
 */

/** Состояние поиска по книге. */
export interface SearchState {
    /** Сколько вхождений найдено. */
    total: number;
    /** Номер вхождения, к которому ведёт переход; `null` — перехода ещё нет. */
    index: number | null;
    /** Найдено больше вхождений, чем показывается. */
    truncated: boolean;
}

/** Пустое состояние: запрос не задан или ничего не найдено. */
export const EMPTY_SEARCH_STATE: SearchState = { total: 0, index: null, truncated: false };

/** Следующий индекс вхождения с переходом по кругу.
 *
 * Переход по кругу привычен: после последнего вхождения поиск возвращается к
 * первому, а до первого — к последнему. Когда перехода ещё не было, «вперёд»
 * ведёт к первому вхождению, «назад» — к последнему.
 */
export function stepSearchIndex(state: SearchState, delta: 1 | -1): number | null {
    if (state.total <= 0) {
        return null;
    }
    if (state.index === null) {
        return delta > 0 ? 0 : state.total - 1;
    }
    const next = state.index + delta;
    if (next < 0) {
        return state.total - 1;
    }
    if (next >= state.total) {
        return 0;
    }
    return next;
}

/** Состояние поиска с выбранным вхождением. */
export function withSearchIndex(state: SearchState, index: number | null): SearchState {
    return { ...state, index: index === null ? null : Math.max(0, index) };
}
