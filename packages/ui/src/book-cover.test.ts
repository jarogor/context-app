import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import BookCover from './components/BookCover.svelte';
import BookCoverPlaceholder from './components/BookCoverPlaceholder.svelte';

describe('заглушка обложки', () => {
  it('отделяется от подложки заливкой и обводкой', () => {
    // Регресс: заглушка рисовалась тем же тоном, что и «полка» под ней,
    // поэтому пустой квадрат сливался с фоном и был невидим. Теперь у неё
    // собственная заливка (`--muted`) и обводка (`--border`).
    render(BookCoverPlaceholder, { props: { testId: 'ph' } });

    const box = screen.getByTestId('ph');
    expect(box.className).toContain('bg-[var(--muted)]');
    expect(box.className).toContain('border-[var(--border)]');
  });
});

describe('обложка книги', () => {
  it('без источника показывает заглушку, а не пустой блок', () => {
    render(BookCover, { props: { src: null, testId: 'cover' } });

    // Обложки-картинки нет; вместо неё — заглушка с силуэтом книги.
    expect(screen.getByTestId('cover').querySelector('img')).toBeNull();
    expect(screen.getByTestId('cover').querySelector('svg')).not.toBeNull();
  });

  it('с источником показывает изображение', () => {
    render(BookCover, { props: { src: 'data:image/png;base64,AAAA', testId: 'cover' } });

    const image = screen.getByTestId('cover').querySelector('img');
    expect(image?.getAttribute('src')).toBe('data:image/png;base64,AAAA');
  });
});
