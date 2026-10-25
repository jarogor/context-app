import { describe, expect, it, vi } from 'vitest';

import { LINK_CLASS, LINK_LAYER_CLASS, clearLinkLayer, renderLinks } from './links';

vi.mock('./navigation', () => ({ gotoPage: vi.fn() }));
vi.mock('./protocol', () => ({ post: vi.fn() }));

import { gotoPage } from './navigation';
import { post } from './protocol';

/** Вид страницы с преобразованием координат один к одному. */
function viewport() {
  return {
    convertToViewportRectangle: (rect: number[]) => [
      rect[0],
      // Система координат PDF начинается снизу: верх страницы — её высота.
      800 - rect[3],
      rect[2],
      800 - rect[1],
    ],
  } as never;
}

/** Элемент страницы с наложением заметок. */
function pageElement(): HTMLElement {
  const pageEl = document.createElement('div');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  pageEl.append(overlay);
  document.body.append(pageEl);
  return pageEl;
}

/** Страница pdf.js с заданными аннотациями. */
function page(annotations: unknown[]) {
  return { getAnnotations: async () => annotations } as never;
}

/** Документ, разрешающий именованные цели и ссылки на страницы. */
function documentWith(pages: Record<string, number>) {
  return {
    // Именованная цель разрешается в явный массив: первым элементом — ссылка на
    // страницу. Номер страницы в моке кодируется полем `num` (нумерация с 1).
    getDestination: async (name: string) =>
      name in pages ? [{ num: pages[name] }, 'Fit'] : null,
    getPageIndex: async (ref: { num?: number }) => (ref.num ?? 1) - 1,
  } as never;
}

describe('слой ссылок PDF', () => {
  it('строит прямоугольник ссылки по аннотации и переходит на её страницу', async () => {
    const pageEl = pageElement();
    const doc = documentWith({ 'chapter-2': 3 });
    await renderLinks(
      doc,
      page([
        {
          subtype: 'Link',
          rect: [100, 700, 300, 720],
          dest: 'chapter-2',
          title: 'Глава 2',
        },
      ]),
      pageEl,
      viewport(),
    );

    const layer = pageEl.querySelector(`.${LINK_LAYER_CLASS}`) as HTMLElement;
    expect(layer).toBeTruthy();
    const link = layer.querySelector(`.${LINK_CLASS}`) as HTMLAnchorElement;
    expect(link).toBeTruthy();
    // Прямоугольник переведён в координаты окна: у PDF система снизу.
    expect(link.style.top).toBe('80px');
    expect(link.style.height).toBe('20px');
    expect(link.title).toBe('Глава 2');

    link.click();
    await vi.waitFor(() => expect(gotoPage).toHaveBeenCalledWith(3));
    pageEl.remove();
  });

  it('разрешает явную цель перехода по ссылке на страницу', async () => {
    const pageEl = pageElement();
    const doc = documentWith({});
    await renderLinks(
      doc,
      page([{ subtype: 'Link', rect: [0, 0, 10, 10], dest: [{ num: 5 }, 'XYZ', 0, 0, 0] }]),
      pageEl,
      viewport(),
    );

    (pageEl.querySelector(`.${LINK_CLASS}`) as HTMLAnchorElement).click();
    await vi.waitFor(() => expect(gotoPage).toHaveBeenCalledWith(5));
    pageEl.remove();
  });

  it('внешнюю ссылку отдаёт приложению, а не открывает сама', async () => {
    const pageEl = pageElement();
    await renderLinks(
      documentWith({}),
      page([{ subtype: 'Link', rect: [0, 0, 10, 10], url: 'https://example.org/' }]),
      pageEl,
      viewport(),
    );

    (pageEl.querySelector(`.${LINK_CLASS}`) as HTMLAnchorElement).click();
    expect(post).toHaveBeenCalledWith({
      type: 'open-link',
      value: { href: 'https://example.org/' },
    });
    expect(gotoPage).not.toHaveBeenCalled();
    pageEl.remove();
  });

  it('не рисует ссылки для аннотаций другого вида', async () => {
    const pageEl = pageElement();
    await renderLinks(
      documentWith({}),
      page([
        { subtype: 'Text', rect: [0, 0, 10, 10] },
        { subtype: 'Highlight', rect: [0, 0, 10, 10] },
      ]),
      pageEl,
      viewport(),
    );
    expect(pageEl.querySelector(`.${LINK_LAYER_CLASS}`)).toBeNull();
    pageEl.remove();
  });

  it('снимает прежний слой при перерисовке страницы', async () => {
    const pageEl = pageElement();
    const links = page([{ subtype: 'Link', rect: [0, 0, 10, 10], dest: [{ num: 1 }] }]);
    await renderLinks(documentWith({}), links, pageEl, viewport());
    expect(pageEl.querySelectorAll(`.${LINK_LAYER_CLASS}`)).toHaveLength(1);

    await renderLinks(documentWith({}), links, pageEl, viewport());
    expect(pageEl.querySelectorAll(`.${LINK_LAYER_CLASS}`)).toHaveLength(1);

    clearLinkLayer(pageEl);
    expect(pageEl.querySelector(`.${LINK_LAYER_CLASS}`)).toBeNull();
    pageEl.remove();
  });

  it('ставит слой ссылок выше текста, но ниже заметок', async () => {
    const pageEl = pageElement();
    const textLayer = document.createElement('div');
    textLayer.className = 'textLayer';
    pageEl.prepend(textLayer);

    await renderLinks(
      documentWith({}),
      page([{ subtype: 'Link', rect: [0, 0, 10, 10], dest: [{ num: 1 }] }]),
      pageEl,
      viewport(),
    );

    const order = Array.from(pageEl.children).map((node) => node.className);
    expect(order.indexOf('textLayer')).toBeLessThan(order.indexOf(LINK_LAYER_CLASS));
    expect(order.indexOf(LINK_LAYER_CLASS)).toBeLessThan(order.indexOf('overlay'));
    pageEl.remove();
  });
});
