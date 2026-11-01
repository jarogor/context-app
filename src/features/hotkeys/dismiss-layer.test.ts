import { afterEach, describe, expect, it, vi } from 'vitest';

import { dismissTopLayer, pushDismissLayer, resetDismissLayers } from './dismiss-layer';

afterEach(() => {
    resetDismissLayers();
});

describe('стек закрываемых слоёв', () => {
    it('закрывает последний открытый слой', () => {
        const order: string[] = [];
        pushDismissLayer(() => order.push('нижний'));
        pushDismissLayer(() => order.push('верхний'));

        expect(dismissTopLayer()).toBe(true);
        expect(order).toEqual(['верхний']);
        expect(dismissTopLayer()).toBe(true);
        expect(order).toEqual(['верхний', 'нижний']);
        expect(dismissTopLayer()).toBe(false);
    });

    it('снятие регистрации убирает слой из стека', () => {
        const handler = vi.fn();
        const remove = pushDismissLayer(handler);
        remove();
        remove();

        expect(dismissTopLayer()).toBe(false);
        expect(handler).not.toHaveBeenCalled();
    });

    it('снятие нижнего слоя не трогает верхний', () => {
        const lower = vi.fn();
        const upper = vi.fn();
        const removeLower = pushDismissLayer(lower);
        pushDismissLayer(upper);

        removeLower();
        dismissTopLayer();

        expect(upper).toHaveBeenCalledTimes(1);
        expect(lower).not.toHaveBeenCalled();
    });
});
