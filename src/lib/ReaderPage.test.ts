import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import ReaderPage from './ReaderPage.svelte';

vi.mock('./reader', () => ({
  UnsupportedFormatError: class UnsupportedFormatError extends Error {},
  bookAvailable: vi.fn(async () => true),
  bookFormat: vi.fn(async () => 'epub'),
  isSupportedFormat: (format: string) => format === 'epub',
  loadBookContent: vi.fn(async () => ({
    title: 'Книга',
    authors: [],
    chapters: [{ title: null, html: '<p>Текст</p>' }],
  })),
  openBookExternally: vi.fn(),
  selectWorkplacePlugin: vi.fn(async () => null),
}));

describe('ReaderPage как содержимое вкладки', () => {
  it('принимает начальные масштаб и позицию вкладки', () => {
    render(ReaderPage, {
      props: { bookId: 'book-1', title: 'Книга', initialZoom: 130, initialPosition: 40 },
    });

    expect(screen.getByTestId('reader-zoom').textContent).toBe('130%');
    expect(screen.getByTestId('reader-progress').textContent).toBe('40%');
  });

  it('сообщает наружу изменение масштаба', async () => {
    const onStateChange = vi.fn();
    render(ReaderPage, {
      props: {
        bookId: 'book-1',
        title: 'Книга',
        initialZoom: 130,
        initialPosition: 40,
        onStateChange,
      },
    });

    await fireEvent.click(screen.getByLabelText('Увеличить масштаб'));

    expect(screen.getByTestId('reader-zoom').textContent).toBe('140%');
    expect(onStateChange).toHaveBeenCalledWith({ zoom: 140, position: 40 });
  });

  it('показывает заглушку недоступной книги', async () => {
    const reader = await import('./reader');
    vi.mocked(reader.bookAvailable).mockResolvedValueOnce(false);

    render(ReaderPage, { props: { bookId: 'gone', title: 'Пропавшая книга' } });

    expect(await screen.findByTestId('reader-unavailable')).toBeTruthy();
    expect(screen.getByText('Пропавшая книга')).toBeTruthy();
  });
});
