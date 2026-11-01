import { describe, expect, it } from 'vitest';

import { formatDateTime, formatTime } from './format';

describe('formatDateTime', () => {
    it('форматирует дату по-русски: ДД.ММ.ГГГГ чч:мм', () => {
        // 2023-11-15 01:13 по Москве (тесты фиксируют TZ Europe/Moscow в e2e, здесь
        // берём момент с явным местным представлением через компоненты).
        const millis = new Date(2023, 10, 15, 1, 13).getTime();

        expect(formatDateTime(millis, 'ru')).toBe('15.11.2023 01:13');
    });

    it('дополняет день, месяц, час и минуту нулями', () => {
        const millis = new Date(2024, 0, 5, 9, 7).getTime();

        expect(formatDateTime(millis, 'ru')).toBe('05.01.2024 09:07');
    });

    it('форматирует дату по-английски: ММ/ДД/ГГГГ чч:мм AM', () => {
        // Язык интерфейса следует за настройкой, поэтому порядок частей и
        // 12-часовой формат — часть одного и того же выбора.
        const afternoon = new Date(2024, 0, 5, 13, 7).getTime();
        expect(formatDateTime(afternoon, 'en')).toBe('01/05/2024 01:07 PM');
    });

    it('ноль даёт пустую строку', () => {
        expect(formatDateTime(0, 'ru')).toBe('');
        expect(formatDateTime(0, 'en')).toBe('');
    });
});

describe('formatTime', () => {
    it('форматирует время по-русски: чч:мм:сс', () => {
        const millis = new Date(2023, 10, 15, 1, 13, 5).getTime();

        expect(formatTime(millis, 'ru')).toBe('01:13:05');
    });

    it('дополняет час, минуту и секунду нулями', () => {
        const millis = new Date(2024, 0, 5, 9, 7, 3).getTime();

        expect(formatTime(millis, 'ru')).toBe('09:07:03');
    });

    it('форматирует время по-английски: чч:мм:сс AM', () => {
        const millis = new Date(2024, 0, 5, 15, 7, 3).getTime();

        expect(formatTime(millis, 'en')).toBe('03:07:03 PM');
    });

    it('ноль даёт пустую строку', () => {
        expect(formatTime(0, 'ru')).toBe('');
        expect(formatTime(0, 'en')).toBe('');
    });
});
