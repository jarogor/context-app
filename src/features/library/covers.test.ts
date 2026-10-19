import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cachedCovers, hasCover, loadCovers } from './covers';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
    invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
    invoke.mockReset();
});

describe('кэш обложек оболочки', () => {
    it('запрашивает неизвестные пути одним вызовом и переводит ответ в data URI', async () => {
        invoke.mockResolvedValue({ '/lib/a.epub': { data: 'AAAA', format: 'png' } });

        await loadCovers(['/lib/a.epub']);

        expect(invoke).toHaveBeenCalledTimes(1);
        expect(invoke).toHaveBeenCalledWith('workspace_covers', { paths: ['/lib/a.epub'] });
        expect(cachedCovers(['/lib/a.epub'])['/lib/a.epub']).toBe('data:image/png;base64,AAAA');
    });

    it('не перезапрашивает уже известные пути', async () => {
        invoke.mockResolvedValue({ '/lib/a.epub': { data: 'AAAA', format: 'jpeg' } });
        await loadCovers(['/lib/a.epub']);
        invoke.mockClear();

        await loadCovers(['/lib/a.epub']);

        expect(invoke).not.toHaveBeenCalled();
        expect(hasCover('/lib/a.epub')).toBe(true);
    });

    it('запоминает отсутствие обложки как `null`', async () => {
        invoke.mockResolvedValue({ '/lib/a.pdf': { data: null } });

        await loadCovers(['/lib/a.pdf']);

        expect(cachedCovers(['/lib/a.pdf'])['/lib/a.pdf']).toBeNull();
        expect(hasCover('/lib/a.pdf')).toBe(true);
    });

    it('не делает вызова при пустом списке', async () => {
        await loadCovers([]);
        expect(invoke).not.toHaveBeenCalled();
    });

    it('не прерывает работу при ошибке ядра', async () => {
        invoke.mockRejectedValue(new Error('ядро недоступно'));

        await expect(loadCovers(['/lib/absent.epub'])).resolves.toBeUndefined();
        expect(hasCover('/lib/absent.epub')).toBe(false);
    });
});
