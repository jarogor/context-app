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
    it('читает реестр рабочих мест, библиотеку и данные поверхностей', async () => {
        const registry = { workspaces: [{ id: 'ws-1' }], active_workspace_id: 'ws-1' };
        invoke.mockImplementation(async (command: string, args?: unknown) => {
            if (command === 'get_workspaces') {
                return registry;
            }
            if (command === 'active_library') {
                return { path: '/lib', provider_name: 'library' };
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
            return null;
        });

        const state = await loadBootstrap();

        expect(state.registry).toBe(registry);
        expect(state.activeLibrary).toEqual({ path: '/lib', provider_name: 'library' });
        expect(state.settings.declarations).toHaveLength(1);
        expect(state.settings.error).toBe('');
        expect(state.notifications.entries).toHaveLength(1);
        expect(state.notifications.technicalVisible).toBe(true);
        expect(state.notifications.error).toBe('');
        expect(state.store.plugins).toHaveLength(1);
        expect(state.store.stores).toHaveLength(1);
        expect(state.store.activationPending).toBe(true);
        expect(state.store.error).toBe('');
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

    it('применяет сохранённые тему и палитру до готовности оболочки', async () => {
        document.documentElement.removeAttribute('data-theme');
        document.documentElement.removeAttribute('data-palette');
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return { workspaces: [] };
            }
            if (command === 'theme_preference') {
                return 'dark';
            }
            if (command === 'theme_palette') {
                return 'mist';
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.appearance).toEqual({ theme: 'dark', palette: 'mist' });
        expect(document.documentElement.dataset.theme).toBe('dark');
        expect(document.documentElement.dataset.palette).toBe('mist');
    });

    it('оставляет оформление по умолчанию, если чтение не удалось', async () => {
        document.documentElement.setAttribute('data-theme', 'dark');
        document.documentElement.setAttribute('data-palette', 'mist');
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
            return null;
        });

        const state = await loadBootstrap();

        expect(state.appearance).toEqual({ theme: 'system', palette: 'gruvbox' });
        expect(document.documentElement.dataset.theme).toBe('light');
        expect(document.documentElement.dataset.palette).toBe('gruvbox');
    });
});
