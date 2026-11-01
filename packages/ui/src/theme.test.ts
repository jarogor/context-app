import { describe, expect, it } from 'vitest';

import {
    applyTheme,
    isThemePreference,
    normalizeThemePreference,
    oppositeTheme,
    resolveTheme,
    type ThemePreference,
} from './theme';

/** Поддельный список медиа-запросов для проверки подписки на тему ОС. */
function fakeMedia(initialDark: boolean) {
    const listeners = new Set<() => void>();
    return {
        matches: initialDark,
        addEventListener: (_type: string, listener: () => void) => {
            listeners.add(listener);
        },
        removeEventListener: (_type: string, listener: () => void) => {
            listeners.delete(listener);
        },
        /** Смена темы ОС и уведомление подписчиков. */
        emit(matches: boolean) {
            this.matches = matches;
            for (const listener of listeners) {
                listener();
            }
        },
        get size() {
            return listeners.size;
        },
    };
}

describe('resolveTheme', () => {
    it('системная тема следует тёмному предпочтению ОС', () => {
        expect(resolveTheme('system', true)).toBe('dark');
        expect(resolveTheme('system', false)).toBe('light');
    });

    it('явная тема игнорирует предпочтение ОС', () => {
        expect(resolveTheme('light', true)).toBe('light');
        expect(resolveTheme('dark', false)).toBe('dark');
    });
});

describe('oppositeTheme', () => {
    it('переключает только между явными сторонами темы', () => {
        // Кнопка в шапке не имеет третьего положения: нажатие всегда даёт
        // противоположную сторону, в том числе когда интерфейс следует теме ОС.
        expect(oppositeTheme('light')).toBe('dark');
        expect(oppositeTheme('dark')).toBe('light');
    });
});

describe('normalizeThemePreference', () => {
    it('сохраняет допустимые значения', () => {
        for (const value of ['light', 'dark', 'system'] as ThemePreference[]) {
            expect(normalizeThemePreference(value)).toBe(value);
            expect(isThemePreference(value)).toBe(true);
        }
    });

    it('неизвестное значение приводит к system', () => {
        expect(normalizeThemePreference('sepia')).toBe('system');
        expect(normalizeThemePreference(undefined)).toBe('system');
        expect(isThemePreference(7)).toBe(false);
    });
});

describe('applyTheme', () => {
    it('выставляет атрибут data-theme для явной темы', () => {
        const root = { dataset: {} } as unknown as HTMLElement;
        const media = fakeMedia(false);

        applyTheme('dark', root, media);

        expect(root.dataset.theme).toBe('dark');
    });

    it('следит за темой ОС для system и снимает подписку', () => {
        const root = { dataset: {} } as unknown as HTMLElement;
        const media = fakeMedia(false);

        const unsubscribe = applyTheme('system', root, media);
        expect(root.dataset.theme).toBe('light');
        expect(media.size).toBe(1);

        media.emit(true);
        expect(root.dataset.theme).toBe('dark');

        unsubscribe();
        expect(media.size).toBe(0);
    });

    it('явная тема не подписывается на изменение темы ОС', () => {
        const root = { dataset: {} } as unknown as HTMLElement;
        const media = fakeMedia(false);

        applyTheme('light', root, media);

        expect(root.dataset.theme).toBe('light');
        expect(media.size).toBe(0);
    });
});
