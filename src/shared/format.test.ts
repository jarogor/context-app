import { describe, expect, it } from 'vitest';

import { formatDateTime } from './format';

describe('formatDateTime', () => {
    it('форматирует дату по-русски: ДД.ММ.ГГГГ чч:мм', () => {
        // 2023-11-15 01:13 по Москве (тесты фиксируют TZ Europe/Moscow в e2e, здесь
        // берём момент с явным местным представлением через компоненты).
        const millis = new Date(2023, 10, 15, 1, 13).getTime();

        expect(formatDateTime(millis)).toBe('15.11.2023 01:13');
    });

    it('дополняет день, месяц, час и минуту нулями', () => {
        const millis = new Date(2024, 0, 5, 9, 7).getTime();

        expect(formatDateTime(millis)).toBe('05.01.2024 09:07');
    });

    it('ноль даёт пустую строку', () => {
        expect(formatDateTime(0)).toBe('');
    });
});
