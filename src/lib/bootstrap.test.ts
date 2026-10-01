import { describe, expect, it, vi, beforeEach } from 'vitest';
import { loadBootstrap } from './bootstrap';
import { invokeCommand } from './app-bridge';

vi.mock('./app-bridge', () => ({
    invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
    invoke.mockReset();
});

describe('загрузка начального состояния', () => {
    it('читает реестр рабочих мест и активную библиотеку', async () => {
        const registry = { workspaces: [{ id: 'ws-1' }], active_workspace_id: 'ws-1' };
        invoke.mockImplementation(async (command: string) => {
            if (command === 'get_workspaces') {
                return registry;
            }
            if (command === 'active_library') {
                return { path: '/lib', provider_name: 'library' };
            }
            return null;
        });

        const state = await loadBootstrap();

        expect(state.registry).toBe(registry);
        expect(state.activeLibrary).toEqual({ path: '/lib', provider_name: 'library' });
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
});
