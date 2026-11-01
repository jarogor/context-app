import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import NotificationsPanel from './NotificationsPanel.svelte';
import { invokeCommand } from '../../shared/app-bridge';
import { emitMockEvent } from '@context/testing';
import type { NotificationEntry } from './notifications';

vi.mock('../../shared/app-bridge', async () => {
    const { mockListen } = await import('@context/testing');
    return {
        invokeCommand: vi.fn(),
        // Регистрация обработчика события в моке моста синхронна вызову.
        listenEvent: vi.fn((event: string, handler: (value: unknown) => void) =>
            Promise.resolve(mockListen(event, handler)),
        ),
    };
});

const invoke = vi.mocked(invokeCommand);

/** Запись журнала уведомлений для теста. */
function entry(overrides: Partial<NotificationEntry>): NotificationEntry {
    return {
        id: 1,
        timestamp: 1_700_000_000_000,
        level: 'User',
        severity: 'info',
        message: 'сообщение',
        source: 'app',
        details: {},
        read: false,
        ...overrides,
    };
}

beforeEach(() => {
    invoke.mockReset();
});

describe('панель уведомлений', () => {
    it('рисует записи, загруженные на бутстрапе, без обращения к плагину', () => {
        const onUnreadChange = vi.fn();

        render(NotificationsPanel, {
            initialEntries: [
                entry({ id: 1, level: 'User', message: 'Библиотека открыта', read: false }),
            ],
            onUnreadChange,
        });

        expect(screen.getByText('Библиотека открыта')).toBeTruthy();
        expect(onUnreadChange).toHaveBeenCalledWith(1);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('не показывает техническую диагностику даже если она попала в журнал', () => {
        // Технические события живут в файле и поддержке, а не в ленте: человеку
        // строка «Плагин загружен» ничего не объясняет.
        render(NotificationsPanel, {
            initialEntries: [
                entry({ id: 1, level: 'User', message: 'Библиотека открыта' }),
                entry({ id: 2, level: 'Technical', message: 'Плагин пропущен' }),
            ],
        });

        expect(screen.getByText('Библиотека открыта')).toBeTruthy();
        expect(screen.queryByText('Плагин пропущен')).toBeNull();
    });

    it('красит счётчик непрочитанного акцентом темы, а не отдельным зелёным', () => {
        // Счётчик — метка действия: её цвет берётся из акцента активной палитры
        // (`--counter`), поэтому в каждой теме он свой и согласован с выделением.
        // Отдельный «успешный» зелёный одинаков во всех палитрах и резал глаз.
        render(NotificationsPanel, {
            initialEntries: [entry({ id: 1, level: 'User', read: false })],
            onUnreadChange: vi.fn(),
        });

        const badge = screen.getByLabelText('Непрочитанных: 1');
        expect(badge.style.background).toContain('var(--counter)');
        expect(badge.className).toContain('text-[var(--counter-foreground)]');
        expect(badge.className).not.toContain('var(--success)');
    });

    it('добавляет записи, приходящие событием журнала', async () => {
        render(NotificationsPanel, {
            initialEntries: [],
        });

        emitMockEvent(
            'notifications:added',
            entry({ id: 9, level: 'User', message: 'Новое событие' }),
        );

        expect(await screen.findByText('Новое событие')).toBeTruthy();
    });

    it('не читает настройки на событие другой секции', async () => {
        // Панель не зависит от настроек: журнал только пользовательский, и
        // сохранение темы из настроек не должно вызывать запросов журнала.
        invoke.mockResolvedValue({ version: 1, sections: [] });

        render(NotificationsPanel, {
            initialEntries: [],
        });

        // Даём панели подписаться на события.
        await new Promise((resolve) => setTimeout(resolve, 10));
        invoke.mockClear();

        emitMockEvent('settings:changed', { section: 'app.general', values: {} });
        emitMockEvent('settings:changed', { section: 'notifications.notifications', values: {} });
        await new Promise((resolve) => setTimeout(resolve, 20));
        // Ни одна секция не вызывает запросов: панель живёт без настроек.
        expect(invoke).not.toHaveBeenCalled();
    });
});
