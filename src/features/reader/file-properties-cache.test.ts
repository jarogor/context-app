import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(async () => null),
}));

import { invokeCommand } from '../../shared/app-bridge';
import {
  forgetCachedProperties,
  loadCachedProperties,
  saveCachedProperties,
} from './file-properties-cache';

const mockedInvoke = vi.mocked(invokeCommand);

beforeEach(() => {
  mockedInvoke.mockReset();
  mockedInvoke.mockResolvedValue(null);
});

describe('кэш свойств файла', () => {
  it('читает закладки, число страниц и превью из записи ядра', async () => {
    mockedInvoke.mockResolvedValue({
      properties: {
        bookmarks: [{ title: 'Глава', page: 2 }],
        pageCount: 12,
      },
      annotations: { annotations: [{ id: 'a1', kind: 'highlight', page: 1, rects: [] }] },
      thumbs: { '1': 'data:image/jpeg;base64,AAAA', '2': 'javascript:alert(1)' },
    });

    const cached = await loadCachedProperties('/lib/a.pdf');
    expect(cached).not.toBeNull();
    expect(cached!.pageCount).toBe(12);
    expect(cached!.bookmarks).toEqual([{ title: 'Глава', page: 2 }]);
    expect(cached!.annotations.map((item) => item.id)).toEqual(['a1']);
    // Не картинка отбрасывается: панель не должна получить произвольный URL.
    expect(Object.keys(cached!.thumbs)).toEqual(['1']);
  });

  it('не считает кэшем пустой ответ ядра', async () => {
    mockedInvoke.mockResolvedValue(null);
    expect(await loadCachedProperties('/lib/a.pdf')).toBeNull();
  });

  it('не падает на ошибке моста и нечисловом числе страниц', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('нет ядра'));
    expect(await loadCachedProperties('/lib/a.pdf')).toBeNull();

    mockedInvoke.mockResolvedValue({ properties: { pageCount: 'нет' }, thumbs: {} });
    const cached = await loadCachedProperties('/lib/a.pdf');
    expect(cached!.pageCount).toBeNull();
  });

  it('сохраняет только заданные поля порции', async () => {
    await saveCachedProperties('/lib/a.pdf', {
      thumbs: [{ page: 3, dataUrl: 'data:image/jpeg;base64,AAAA', width: 96, height: 128 }],
    });

    expect(mockedInvoke).toHaveBeenCalledWith('reader_cache_save', {
      path: '/lib/a.pdf',
      thumbs: [
        { page: 3, dataUrl: 'data:image/jpeg;base64,AAAA', width: 96, height: 128 },
      ],
    });
  });

  it('не отправляет пустой список превью', async () => {
    await saveCachedProperties('/lib/a.pdf', { thumbs: [] });
    const payload = mockedInvoke.mock.calls[0][1] as Record<string, unknown>;
    expect('thumbs' in payload).toBe(false);
  });

  it('ошибку записи кэша не выбрасывает наружу', async () => {
    mockedInvoke.mockRejectedValueOnce(new Error('диск занят'));
    await expect(saveCachedProperties('/lib/a.pdf', { properties: {} })).resolves.toBeUndefined();
  });

  it('удаляет запись по пути', async () => {
    await forgetCachedProperties('/lib/a.pdf');
    expect(mockedInvoke).toHaveBeenCalledWith('reader_cache_forget', { path: '/lib/a.pdf' });
  });
});
