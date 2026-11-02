import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import FilePropertiesPanel from './FilePropertiesPanel.svelte';
import { emptyProperties, type FileAnnotation, type FilePropertiesSnapshot } from './file-properties';

/** Снимок свойств текучей книги с содержанием. */
function flowingSnapshot(): FilePropertiesSnapshot {
  return {
    ...emptyProperties('epub'),
    flowing: true,
    chapters: [
      { index: 0, title: 'Введение' },
      { index: 1, title: 'Первая глава' },
    ],
  };
}

/** Снимок свойств страничной книги с закладками, превью и пометками. */
function pagedSnapshot(): FilePropertiesSnapshot {
  return {
    ...emptyProperties('pdf'),
    bookmarksSupported: true,
    bookmarks: [
      {
        title: 'Часть',
        page: 1,
        children: [{ title: 'Глава', page: 3, children: [] }],
      },
    ],
    pageCount: 3,
    thumbnails: true,
    annotationsSupported: true,
    annotationsDone: true,
    annotationsProcessed: 3,
    annotationsTotal: 3,
    annotations: [
      {
        id: 'a1',
        kind: 'highlight',
        page: 2,
        rects: [{ x: 0.1, y: 0.1, width: 0.2, height: 0.02 }],
        quote: 'выделенный текст',
        comment: 'комментарий',
        author: 'Читатель',
        color: '#ffff00',
        modified: '',
      },
      {
        id: 'a2',
        kind: 'note',
        page: 3,
        rects: [{ x: 0.5, y: 0.5, width: 0.1, height: 0.1 }],
        quote: '',
        comment: 'стикер',
        author: '',
        color: '',
        modified: '',
      },
    ],
  };
}

/** Признак вызова с обработчиком вкладки. */
function noop() {
  return undefined;
}

describe('панель свойств файла', () => {
  it('показывает содержание текучей книги и переходит к главе', async () => {
    const onGoToChapter = vi.fn();
    render(FilePropertiesPanel, {
      props: { snapshot: flowingSnapshot(), tab: 'contents', currentPage: null, onGoToChapter },
    });

    expect(screen.getByTestId('properties-tabs')).toBeTruthy();
    const rows = screen.getAllByTestId('properties-content-row');
    expect(rows).toHaveLength(2);

    await fireEvent.click(screen.getByText('Первая глава'));
    expect(onGoToChapter).toHaveBeenCalledWith({ index: 1, title: 'Первая глава' });
  });

  it('показывает вкладки по возможностям формата', () => {
    render(FilePropertiesPanel, {
      props: { snapshot: pagedSnapshot(), tab: null, currentPage: 1 },
    });

    expect(screen.getByTestId('properties-tab-bookmarks')).toBeTruthy();
    expect(screen.getByTestId('properties-tab-pages')).toBeTruthy();
    expect(screen.getByTestId('properties-tab-annotations')).toBeTruthy();
    // Содержания у страничной книги нет: вкладка не появляется.
    expect(screen.queryByTestId('properties-tab-contents')).toBeNull();
  });

  it('показывает закладки с вложенностью и переходит по странице', async () => {
    const onGoToBookmark = vi.fn();
    render(FilePropertiesPanel, {
      props: {
        snapshot: pagedSnapshot(),
        tab: 'bookmarks',
        currentPage: 1,
        onGoToBookmark,
      },
    });

    const rows = screen.getAllByTestId('properties-bookmark-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Часть');

    await fireEvent.click(rows[1]);
    expect(onGoToBookmark).toHaveBeenCalledWith({ title: 'Глава', page: 3, children: [] });
  });

  it('заказывает недостающие миниатюры и переходит по нажатию на страницу', async () => {
    const onRequestThumbs = vi.fn();
    const onGoToPage = vi.fn();
    render(FilePropertiesPanel, {
      props: {
        snapshot: pagedSnapshot(),
        tab: 'pages',
        currentPage: 1,
        onRequestThumbs,
        onGoToPage,
      },
    });

    expect(onRequestThumbs).toHaveBeenCalledWith([1, 2, 3], expect.any(Number));

    const pages = screen.getAllByTestId('properties-page');
    expect(pages).toHaveLength(3);
    await fireEvent.click(pages[1]);
    expect(onGoToPage).toHaveBeenCalledWith(2);
  });

  it('показывает пометки и переключает их показ на странице', async () => {
    const onToggleAnnotation = vi.fn();
    render(FilePropertiesPanel, {
      props: {
        snapshot: pagedSnapshot(),
        tab: 'annotations',
        currentPage: 1,
        onToggleAnnotation,
      },
    });

    const rows = screen.getAllByTestId('properties-annotation-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('выделенный текст');
    expect(rows[0].textContent).toContain('комментарий');

    // По умолчанию пометки не показаны: это чужой слой файла.
    expect(onToggleAnnotation).not.toHaveBeenCalled();

    // Нажатие на строку показывает ровно эту пометку.
    await fireEvent.click(rows[0]);
    expect(onToggleAnnotation).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'a1' }),
      true,
    );

    // Галочка снимает показ.
    const toggle = screen.getAllByTestId('properties-annotation-toggle')[0];
    await fireEvent.change(toggle, { target: { checked: false } });
    expect(onToggleAnnotation).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'a1' }),
      false,
    );
  });

  it('фильтрует пометки по комментарию', async () => {
    render(FilePropertiesPanel, {
      props: { snapshot: pagedSnapshot(), tab: 'annotations', currentPage: 1 },
    });

    await fireEvent.input(screen.getByPlaceholderText('Поиск по разделам файла'), {
      target: { value: 'стикер' },
    });

    const rows = screen.getAllByTestId('properties-annotation-row');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('стикер');
  });

  it('не показывает панель с пустым набором вкладок', () => {
    render(FilePropertiesPanel, {
      props: { snapshot: emptyProperties('mobi'), tab: null, currentPage: null },
    });
    expect(screen.getByTestId('properties-empty')).toBeTruthy();
  });

  it('запускает анализ пометок при открытии вкладки', () => {
    const onAnalyzeAnnotations = vi.fn();
    const snapshot: FilePropertiesSnapshot = {
      ...pagedSnapshot(),
      annotationsDone: false,
      annotationsProcessed: 0,
      annotations: [],
    };
    render(FilePropertiesPanel, {
      props: {
        snapshot,
        tab: 'annotations',
        currentPage: 1,
        onAnalyzeAnnotations,
      },
    });
    expect(onAnalyzeAnnotations).toHaveBeenCalled();
  });

  it('показывает прогресс разбора и кнопку остановки', () => {
    const snapshot: FilePropertiesSnapshot = {
      ...pagedSnapshot(),
      annotationsDone: false,
      annotationsProcessed: 4,
      annotationsTotal: 20,
      annotations: [],
    };
    render(FilePropertiesPanel, {
      props: { snapshot, tab: 'annotations', currentPage: 1 },
    });
    expect(screen.getByTestId('properties-annotations-status').textContent).toContain('4');
    expect(screen.getByTestId('properties-annotations-stop')).toBeTruthy();
  });

  it('не заказывает повторно страницы, которые не нарисовались', async () => {
    const onRequestThumbs = vi.fn();
    const { rerender } = render(FilePropertiesPanel, {
      props: {
        snapshot: pagedSnapshot(),
        tab: 'pages',
        currentPage: 1,
        onRequestThumbs,
      },
    });

    const first = onRequestThumbs.mock.calls.length;
    expect(first).toBeGreaterThan(0);
    // Ни одна картинка не пришла: без запрета повторов панель заказывала бы те
    // же страницы на каждое обновление снимка — бесконечный цикл отрисовки.
    await rerender({ snapshot: { ...pagedSnapshot() }, tab: 'pages', currentPage: 1, onRequestThumbs });
    await rerender({ snapshot: { ...pagedSnapshot() }, tab: 'pages', currentPage: 1, onRequestThumbs });
    expect(onRequestThumbs.mock.calls.length).toBe(first);
  });

  it('показывает пометку на странице при наличии в снимке', async () => {
    const annotation: FileAnnotation = {
      id: 'a1',
      kind: 'underline',
      page: 1,
      rects: [],
      quote: 'подчёркнутое',
      comment: '',
      author: '',
      color: '',
      modified: '',
    };
    const snapshot: FilePropertiesSnapshot = {
      ...emptyProperties('pdf'),
      annotationsSupported: true,
      annotationsDone: true,
      annotationsProcessed: 1,
      annotationsTotal: 1,
      annotations: [annotation],
    };
    render(FilePropertiesPanel, {
      props: { snapshot, tab: 'annotations', currentPage: 1 },
    });
    const rows = screen.getAllByTestId('properties-annotation-row');
    expect(rows[0].textContent).toContain('подчёркнутое');
    expect(rows[0].textContent).toContain('Подчёркивание');
    expect(noop()).toBeUndefined();
  });
});
