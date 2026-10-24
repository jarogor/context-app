import { render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import NotificationsPanel from './NotificationsPanel.svelte';
import { invokeCommand } from '../../shared/app-bridge';
import { emitMockEvent } from '@texture/testing';
import type { NotificationEntry } from './notifications';

vi.mock('../../shared/app-bridge', async () => {
    const { mockListen } = await import('@texture/testing');
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
                entry({ id: 2, level: 'Technical', message: 'Плагин пропущен', read: false }),
            ],
            initialTechnicalVisible: false,
            onUnreadChange,
        });

        expect(screen.getByText('Библиотека открыта')).toBeTruthy();
        expect(screen.queryByText('Плагин пропущен')).toBeNull();
        expect(onUnreadChange).toHaveBeenCalledWith(1);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('показывает технические записи, когда они включены на бутстрапе', () => {
        render(NotificationsPanel, {
            initialEntries: [entry({ id: 2, level: 'Technical', message: 'Плагин пропущен' })],
            initialTechnicalVisible: true,
        });

        expect(screen.getByText('Плагин пропущен')).toBeTruthy();
    });

    it('добавляет записи, приходящие событием журнала', async () => {
        render(NotificationsPanel, {
            initialEntries: [],
            initialTechnicalVisible: false,
        });

        emitMockEvent(
            'notifications:added',
            entry({ id: 9, level: 'User', message: 'Новое событие' }),
        );

        expect(await screen.findByText('Новое событие')).toBeTruthy();
    });

    it('не перезагружает настройки журнала на чужую секцию', async () => {
        // Дефект: панель смонтирована всегда и на каждое событие settings:changed
        // заново запрашивала свои настройки — сохранение темы оформления из
        // настроек задерживало отклик интерфейса.
        invoke.mockResolvedValue({ version: 1, sections: [] });

        render(NotificationsPanel, {
            initialEntries: [],
            initialTechnicalVisible: false,
        });

        // Даём панели подписаться на события.
        await new Promise((resolve) => setTimeout(resolve, 10));

        emitMockEvent('settings:changed', { section: 'app.general', values: {} });
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(invoke).not.toHaveBeenCalled();

        // Своя секция по-прежнему перечитывается.
        emitMockEvent('settings:changed', { section: 'notifications.notifications', values: {} });
        await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    });
});
