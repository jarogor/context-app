import { describe, expect, it } from 'vitest';
import { EMPTY_SEARCH_STATE, stepSearchIndex, withSearchIndex } from './search-state';

describe('состояние поиска', () => {
    it('вперёд с начала ведёт к первому вхождению, назад — к последнему', () => {
        const empty = { ...EMPTY_SEARCH_STATE };
        expect(stepSearchIndex({ ...empty, total: 3 }, 1)).toBe(0);
        expect(stepSearchIndex({ ...empty, total: 3 }, -1)).toBe(2);
    });

    it('переход по кругу: после последнего — первое, до первого — последнее', () => {
        expect(stepSearchIndex({ total: 3, index: 2, truncated: false }, 1)).toBe(0);
        expect(stepSearchIndex({ total: 3, index: 0, truncated: false }, -1)).toBe(2);
        expect(stepSearchIndex({ total: 3, index: 1, truncated: false }, 1)).toBe(2);
    });

    it('без вхождений перехода нет', () => {
        expect(stepSearchIndex(EMPTY_SEARCH_STATE, 1)).toBeNull();
        expect(stepSearchIndex({ total: 0, index: null, truncated: false }, -1)).toBeNull();
    });

    it('выбранное вхождение не выходит за пределы списка', () => {
        expect(withSearchIndex({ total: 2, index: null, truncated: false }, 1).index).toBe(1);
        expect(withSearchIndex({ total: 2, index: null, truncated: false }, null).index).toBeNull();
    });
});
