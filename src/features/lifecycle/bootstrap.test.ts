import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadBootstrap } from './bootstrap';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
    invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
    invoke.mockReset();
});

describe('загрузка начального состояния', () => {
    it('читает реестр рабочих мест, библиотеку и данные областей', async () => {
        const registry = { workspaces: [{ id: 'ws-1' }], active_workspace_id: 'ws-1' };
        invoke.mockImplementation(async (command: string, args?: unknown) => {
            if (command === 'get_workspaces') {
                return registry;
            }
            if (command === 'active_library') {
                return { path: '/lib', provider_name: 'books-source' };
            }
            if (command === 'plugin_activation_pending') {
                return { pending: true };
            }
            if (command === 'invoke_base_plugin_operation') {
                const { capability, operation } = args as {
                    capability: string;
                    operation: string;
                };
                if (capability === 'settings.store@1' && operation === 'ui') {
                    return {
                        version: 1,
                        spaces: [{ space: 'settings.section', id: 'app.general', nodes: [] }],
                    };
                }
                if (capability === 'settings.store@1' && operation === 'list') {
                    return { sections: [{ id: 'notifications.notifications', values: { technical_visible_default: true } }] };
                }
                if (capability === 'notifications.journal@1' && operation === 'list') {
                    return { entries: [{ id: 1, level: 'User', read: false }] };
                }
                if (capability === 'plugin-store@1' && operation === 'plugins') {
                    return { plugins: [{ id: 'p1', name: 'demo' }] };
                }
                if (capability === 'plugin-store@1' && operation === 'stores_list') {
                    return { stores: [{ id: 's1', title: 'store' }] };
                }
            }
            if (command === 'window_open_tabs_limit') {
                return 12;
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.registry).toBe(registry);
        expect(state.activeLibrary).toEqual({ path: '/lib', provider_name: 'books-source' });
        expect(state.settings.declarations).toHaveLength(1);
        expect(state.settings.error).toBe('');
        expect(state.notifications.entries).toHaveLength(1);
        expect(state.notifications.technicalVisible).toBe(true);
        expect(state.notifications.error).toBe('');
        expect(state.store.plugins).toHaveLength(1);
        expect(state.store.stores).toHaveLength(1);
        expect(state.store.activationPending).toBe(true);
        expect(state.store.error).toBe('');
        expect(state.openTabsLimit).toBe(12);
        // Реестр заметок на стадии начальной загрузки не читается.
        expect(
            invoke.mock.calls.some(
                ([command, args]) =>
                    command === 'invoke_base_plugin_operation' &&
                    (args as { capability?: string; operation?: string })?.capability ===
                        'notes.store@1' &&
                    (args as { operation?: string })?.operation === 'list_all_sets',
            ),
        ).toBe(false);
    });

    it('готовит обложки книг рабочих мест до готовности оболочки', async () => {
        const registry = {
            workspaces: [
                { id: 'ws-1', tabs: [{ path: '/lib/a.epub' }, { path: '/lib/b.fb2' }] },
                { id: 'ws-2', tabs: [{ path: '/lib/a.epub' }] },
            ],
        };
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return registry;
            }
            if (command === 'workspace_covers') {
                return {
                    '/lib/a.epub': { data: 'AAAA', format: 'png' },
                    '/lib/b.fb2': { data: null },
                };
            }
            return null;
        });

        await loadBootstrap();

        // Обложки запрошены одним вызовом по уникальным путям всех вкладок.
        const coversCall = invoke.mock.calls.find(([command]) => command === 'workspace_covers');
        expect(coversCall?.[1]).toEqual({ paths: ['/lib/a.epub', '/lib/b.fb2'] });
    });

    it('не считает ошибку загрузки настроек сбоем бутстрапа', async () => {
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return { workspaces: [] };
            }
            if (command === 'invoke_base_plugin_operation') {
                throw new Error('настройки недоступны');
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.settings.declarations).toEqual([]);
        expect(state.settings.error).toContain('настройки недоступны');
        expect(state.notifications.entries).toEqual([]);
        expect(state.notifications.error).toContain('настройки недоступны');
        expect(state.store.plugins).toEqual([]);
        expect(state.store.error).toContain('настройки недоступны');
    });

    it('считает библиотеку не открытой, если сведения недоступны', async () => {
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return { workspaces: [] };
            }
            throw new Error('библиотека недоступна');
        });

        const state = await loadBootstrap();

        expect(state.activeLibrary).toBeNull();
    });

    it('пробрасывает ошибку чтения реестра рабочих мест', async () => {
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                throw new Error('реестр недоступен');
            }
            return null;
        });

        await expect(loadBootstrap()).rejects.toThrow('реестр недоступен');
    });

    it('применяет сохранённые тему, палитру и тему области чтения до готовности оболочки', async () => {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-palette');
        document.documentElement.removeAttribute('data-reader-theme');
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return { workspaces: [] };
            }
            if (command === 'theme_preference') {
                return 'dark';
            }
            if (command === 'theme_palette') {
                return 'cobalt';
            }
            if (command === 'reader_theme') {
                return 'dark';
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.appearance).toEqual({ theme: 'dark', palette: 'cobalt', readerTheme: 'dark' });
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.dataset.palette).toBe('cobalt');
        expect(document.documentElement.dataset.readerTheme).toBe('dark');
    });

    it('оставляет оформление по умолчанию, если чтение не удалось', async () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.setAttribute('data-palette', 'cobalt');
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return { workspaces: [] };
            }
            if (command === 'theme_preference') {
                throw new Error('тема недоступна');
            }
            if (command === 'theme_palette') {
                throw new Error('палитра недоступна');
            }
            if (command === 'reader_theme') {
                throw new Error('тема области чтения недоступна');
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.appearance).toEqual({ theme: 'system', palette: 'linen', readerTheme: 'light' });
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.documentElement.dataset.palette).toBe('linen');
        expect(document.documentElement.dataset.readerTheme).toBe('light');
    });

    it('использует лимит вкладок по умолчанию, если чтение не удалось', async () => {
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return { workspaces: [] };
            }
            if (command === 'window_open_tabs_limit') {
                throw new Error('лимит недоступен');
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.openTabsLimit).toBe(50);
    });
});
