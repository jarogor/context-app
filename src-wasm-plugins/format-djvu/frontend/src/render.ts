/** Отрисовка страниц книги и окон канваса.
 *
 * В разметке живут только страницы у видимой области (см. `list`): книга бывает
 * на тысячи страниц, и полный список страниц не помещается ни в память, ни во
 * время. При смене масштаба распорки виртуального списка пересчитываются, а
 * рисуются заново лишь страницы окна.
 */
import { newPixmap, renderRequest, type DjVuModule, type DjVuPage } from './engine';
import { TEXT_LAYER_CLASS, overlayOf, scrollProgress, viewer } from './dom';
import {
  listHeight,
  pageOffset,
  pageSize,
  realizeWindow,
  rebuildMetrics,
  resetList,
} from './list';
import { drawNotes } from './notes';
import { post } from './protocol';
import { renderSelection } from './selection';
import { state, type CanvasInfo, type RenderedEntry } from './state';
import { alignTextLayerToRaster, buildTextLayer, fitTextLayer } from './text-layer';
import { recolorCanvas } from './theme';
import { boundedRatio, desiredWindow, snapToDevice, type WindowBox } from './viewport';

/** Порядковый номер страницы элемента (1-based). */
export function pageNumber(pageEl: HTMLElement): number {
  return Number(pageEl.dataset.page);
}

/** Пикселей CSS в дюйме: 100 % масштаба — естественный размер страницы. */
export const CSS_DPI = 96;

/** Натуральный размер страницы в CSS-пикселях.
 *
 * Как в PDF-плагине: 100 % — естественный размер страницы файла, переведённый в
 * CSS по разрешению (`пиксели × 96 / DPI`). Размер не зависит от размера окна.
 */
export function naturalPageSize(page: DjVuPage): { width: number; height: number } {
  const stored = page.dpi() || 300;
  const dpi = effectiveDpi(page);
  return {
    width: (page.width_at(stored) * CSS_DPI) / dpi,
    height: (page.height_at(stored) * CSS_DPI) / dpi,
  };
}

/** Обновление высот распорок и размеров живых страниц после смены масштаба. */
export function resizePages(): void {
  rebuildMetrics();
  for (const [page, pageEl] of state.pages) {
    const size = pageSize(page - 1);
    pageEl.style.width = size.width + 'px';
    pageEl.style.height = size.height + 'px';
  }
}

/** Полная перестройка списка после открытия книги. */
export function layoutPages(): void {
  resetList();
  // Новая книга: снимаем возможную паузу отрисовки и очередь прежней книги.
  state.renderToken += 1;
  renderQueue = [];
  if (renderTimer !== null) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
    settleTimer = null;
  }
  rebuildMetrics();
  realizeWindow();
}

/** Сообщение о текущей странице, числе страниц, масштабе и прогрессе. */
export function reportState(): void {
  post({
    type: 'state',
    value: { page: state.currentPage, pages: state.pageCount, zoom: state.zoom },
  });
  post({ type: 'progress', value: scrollProgress() });
}

/** Пикселей родного растра страницы на CSS-пиксель её отображения.
 *
 * Ровно в этой плотности движок рисует страницу один к одному: растр не
 * растягивается и не сжимается. Любое расхождение с плотностью канваса
 * заставляет пересэмплировать весь кадр — в WebKit это стоит около секунды.
 */
function nativePixelsPerCss(page: DjVuPage, viewport: { width: number; height: number }): number {
  const stored = Math.max(1, page.dpi() || 300);
  const width = page.width_at(Math.round(stored));
  return viewport.width > 0 ? width / viewport.width : 1;
}

/** Подготовка канваса страницы: окно и плотность. */
function setupCanvas(
  pageEl: HTMLElement,
  viewport: { width: number; height: number },
  nativeRatio: number,
): {
  /** Готовый канвас (вне документа). */
  canvas: HTMLCanvasElement;
  /** Геометрия окна. */
  info: CanvasInfo;
} {
  const canvas = document.createElement('canvas');
  const rect = pageEl.getBoundingClientRect();
  const viewerRect = viewer.getBoundingClientRect();
  const base: WindowBox = desiredWindow(
    rect,
    viewerRect,
    { width: viewer.clientWidth, height: viewer.clientHeight },
    viewport,
    window.devicePixelRatio || 1,
  );
  // Плотность канваса не выше родной плотности растра: выше — лишние пиксели,
  // которые потом сжимаются обратно (дорого и без выигрыша в детали).
  const ratio = Math.max(
    0.25,
    Math.min(boundedRatio(base.width, base.height, window.devicePixelRatio || 1), nativeRatio),
  );
  const absX0 = snapToDevice(rect.left + base.x0, ratio);
  const absY0 = snapToDevice(rect.top + base.y0, ratio);
  const absRight = snapToDevice(rect.left + base.x0 + base.width, ratio);
  const absBottom = snapToDevice(rect.top + base.y0 + base.height, ratio);
  const x = absX0 - rect.left;
  const y = absY0 - rect.top;
  const width = Math.max(1, absRight - absX0);
  const height = Math.max(1, absBottom - absY0);
  canvas.width = Math.max(1, Math.round(width * ratio));
  canvas.height = Math.max(1, Math.round(height * ratio));
  canvas.style.left = x + 'px';
  canvas.style.top = y + 'px';
  canvas.style.width = width + 'px';
  canvas.style.height = height + 'px';
  return { canvas, info: { x, y, width, height, ratio } };
}

/** Освобождение канвасов всех страниц окна (при смене масштаба или темы).
 *
 * Смена масштаба отменяет и незавершённую очередь отрисовки: страницы рисуются
 * заново уже под новый масштаб. Прежний растр НЕ снимается сразу: пока новый не
 * готов, он держит картинку на месте. Иначе на время отрисовки (до полусекунды
 * на страницу) на месте текста была пустота.
 */
export function releaseWindowPages(): void {
  state.renderToken += 1;
  renderQueue = [];
  if (renderTimer !== null) {
    clearTimeout(renderTimer);
    renderTimer = null;
  }
  for (const pageEl of state.pages.values()) {
    if (!preserveOldRaster(pageEl)) {
      releasePage(pageEl);
    }
  }
}

/**
 * Удержание прежнего растра до готовности нового.
 *
 * Кадр остаётся в разметке и растягивается по новому размеру страницы: он
 * немного мягче, зато текст не пропадает на время отрисовки. Текстовый слой
 * снимается — его слова относятся к прежнему масштабу и перехватывали бы
 * выделение. Запись об отрисовке удаляется, чтобы страница попала в очередь, а
 * старый канвас снимет `renderPage` перед вставкой нового.
 *
 * Возвращает false, если держать нечего.
 */
function preserveOldRaster(pageEl: HTMLElement): boolean {
  const entry = state.rendered.get(pageEl);
  if (!entry) {
    return false;
  }
  entry.textLayer.remove();
  // Растр окна (не вся страница) растягивать нельзя: он покрывает только часть
  // страницы, и растяжение сдвинуло бы текст. Такой канвас снимается.
  const wholePage = Math.abs(entry.info.x) < 0.5 && Math.abs(entry.info.y) < 0.5;
  state.rendered.delete(pageEl);
  delete pageEl.dataset.rendered;
  if (!wholePage) {
    entry.canvas.remove();
    return true;
  }
  entry.canvas.style.left = '0';
  entry.canvas.style.top = '0';
  entry.canvas.style.width = '100%';
  entry.canvas.style.height = '100%';
  return true;
}

/** Освобождение канваса и текстового слоя страницы (память при прокрутке). */
export function releasePage(pageEl: HTMLElement): void {
  state.pending.delete(pageEl);
  const entry = state.rendered.get(pageEl);
  delete pageEl.dataset.rendered;
  // Слой выделения привязан к положению текста: вместе с канвасом он снимается и
  // будет построен заново, когда страница отрисуется.
  const selectionLayer = pageEl.querySelector('.selection-layer');
  if (selectionLayer) {
    selectionLayer.remove();
  }
  if (!entry) {
    return;
  }
  entry.canvas.remove();
  entry.textLayer.remove();
  state.rendered.delete(pageEl);
}

/** Открепление страницы для повторной отрисовки окна.
 *
 * Старый канвас не удаляется: он остаётся видимым, пока новый не готов. Иначе
 * прокрутка внутри большой страницы на время отрисовки обнажала бы белый
 * прямоугольник — текст «пропадал» и мигал.
 */
function detachForRerender(pageEl: HTMLElement): RenderedEntry | null {
  const entry = state.rendered.get(pageEl);
  state.rendered.delete(pageEl);
  delete pageEl.dataset.rendered;
  // Текстовый слой снимается сразу: он не рисуется, но остаётся в разметке и
  // перехватывает выделение. Его слова относятся к прежнему масштабу страницы,
  // поэтому браузер выделял бы текст из старого слоя, а не из нового — выделение
  // расходилось бы с видимыми буквами. Канвас остаётся: он держит картинку,
  // пока новый растр не готов.
  if (entry) {
    entry.textLayer.remove();
  }
  return entry || null;
}

/** Возврат ранее откреплённого канваса, если новая отрисовка не удалась. */
function restoreRendered(pageEl: HTMLElement, entry: RenderedEntry | null): void {
  if (entry && pageEl.isConnected && !state.rendered.has(pageEl)) {
    state.rendered.set(pageEl, entry);
    pageEl.dataset.rendered = '1';
  }
}

/** Разрешение файла, по которому считается натуральный размер страницы.
 *
 * Защита от заведомо неверного DPI в метаданных (0 или 1): по нему страница
 * вышла бы в десятки метров. Обычные значения (100–1200) берутся как есть.
 */
function effectiveDpi(page: DjVuPage): number {
  const stored = page.dpi() || 300;
  return stored >= 24 && stored <= 1200 ? stored : 300;
}

/**
 * Целевой DPI отрисовки страницы в системе координат файла.
 *
 * Считается от РАЗМЕРА КАНВАСА, а не от идеального масштаба: тогда растр
 * совпадает с канвасом в пикселях, и раскладка пикселей — простое копирование.
 * Идеальный расчёт расходился с фактом (предел площади понижал dpi, канвас
 * оставался крупнее), и каждый кадр растягивался — в WebKit это стоило около
 * половины секунды на страницу.
 *
 * Ниже родного разрешения файла dpi не опускается: JB2 хранит буквы в родном
 * разрешении, и при отрисовке мельче движок сводит двухцветный слой без
 * сглаживания — буквы сливаются, и выравнивание текстового слоя перестаёт
 * находить границы слов. На мелком масштабе растр приходит крупнее канваса и
 * сжимается — это и даёт гладкие штрихи.
 */
function rasterDpi(page: DjVuPage, canvas: HTMLCanvasElement): number {
  // Родное разрешение файла: в нём движок рисует один к одному и не сводит JB2.
  const native = Math.max(1, Math.round(page.dpi() || 300));
  const nativeWidth = page.width_at(native);
  if (!(nativeWidth > 0) || !(canvas.width > 0)) {
    return native;
  }
  // DPI, при котором ширина растра равна ширине канваса. Ниже родного не
  // опускается: тогда растр приходит крупнее канваса и сжимается — это и даёт
  // гладкость на мелком масштабе.
  const fromCanvas = Math.round((native * canvas.width) / nativeWidth);
  return Math.max(native, Math.max(1, fromCanvas));
}

/** Отрисовка страницы: окно канваса, текстовый слой, подсветки заметок.
 *
 * При повторной отрисовке окна (`preserve`) новый канвас рисуется откреплённым и
 * вставляется только после готовности: старый остаётся видимым, поэтому прокрутка
 * не обнажает белый прямоугольник.
 */
export function renderPage(
  pageEl: HTMLElement,
  preserve: RenderedEntry | null = null,
  token: number = state.renderToken,
): void {
  const doc = state.doc;
  if (state.rendered.has(pageEl) || state.pending.has(pageEl) || !doc) {
    restoreRendered(pageEl, preserve);
    return;
  }
  const index = pageNumber(pageEl) - 1;
  state.pending.add(pageEl);
  let page: DjVuPage;
  try {
    page = doc.page(index);
  } catch {
    state.pending.delete(pageEl);
    restoreRendered(pageEl, preserve);
    return;
  }
  // Размер страницы измеряется при первой отрисовке: ленивый разбор позволяет
  // не читать все страницы книги при открытии.
  if (!state.naturalSizes[index]) {
    const measured = naturalPageSize(page);
    state.naturalSizes[index] = measured;
    // Неоднородные страницы уточняют высоту списка: распорки пересчитываются.
    if (
      Math.abs(measured.width - state.defaultSize.width) > 1 ||
      Math.abs(measured.height - state.defaultSize.height) > 1
    ) {
      rebuildMetrics();
      scheduleWindowRefresh();
    }
  }
  const viewport = pageSize(index);
  pageEl.style.width = viewport.width + 'px';
  pageEl.style.height = viewport.height + 'px';

  const setup = setupCanvas(pageEl, viewport, nativePixelsPerCss(page, viewport));
  const canvas = setup.canvas;
  const info = setup.info;
  // Канвас читается пикселями (`alignTextLayerToRaster`, перекраска темы),
  // поэтому контекст создаётся в режиме частого чтения: иначе браузер держит
  // растр на видеокарте и каждое `getImageData` стоит сотни миллисекунд.
  const context = canvas.getContext('2d', { willReadFrequently: true });
  const overlay = overlayOf(pageEl);
  if (!context || !overlay) {
    state.pending.delete(pageEl);
    restoreRendered(pageEl, preserve);
    return;
  }

  const textLayerEl = document.createElement('div');
  textLayerEl.className = TEXT_LAYER_CLASS;
  const entry: RenderedEntry = { canvas, textLayer: textLayerEl, info, paint: state.paintKey };

  try {
    const dpi = rasterDpi(page, canvas);
    // Пикселей растра на CSS-пиксель страницы: для файла с неверным DPI не
    // совпадает с плотностью окна, для обычного — совпадает.
    const pixelsPerCss = page.width_at(dpi) / Math.max(1, viewport.width);
    const request = renderRequest(state.module as DjVuModule, dpi);
    const whole =
      Math.abs(info.x) < 0.5 &&
      Math.abs(info.y) < 0.5 &&
      Math.abs(info.width * pixelsPerCss - page.width_at(dpi)) <= 1 &&
      Math.abs(info.height * pixelsPerCss - page.height_at(dpi)) <= 1;
    if (!whole) {
      const pageWidth = page.width_at(dpi);
      const pageHeight = page.height_at(dpi);
      const x = Math.min(Math.max(0, Math.round(info.x * pixelsPerCss)), pageWidth - 1);
      const y = Math.min(Math.max(0, Math.round(info.y * pixelsPerCss)), pageHeight - 1);
      const width = Math.min(
        Math.max(1, Math.round(info.width * pixelsPerCss)),
        pageWidth - x,
      );
      const height = Math.min(
        Math.max(1, Math.round(info.height * pixelsPerCss)),
        pageHeight - y,
      );
      request.set_region(x, y, width, height);
    }
    const pixmap = newPixmap(state.module as DjVuModule);
    page.render_request(request, pixmap);
    // Растр может прийти крупнее канваса (запас детализации): рисунок сжимается
    // до его пикселей — так штрихи шрифта выходят гладкими, а канвас стоит ровно
    // по плотности окна.
    const pixels = new Uint8ClampedArray(pixmap.view());
    const source = new ImageData(pixels, pixmap.width(), pixmap.height());
    if (pixmap.width() === canvas.width && pixmap.height() === canvas.height) {
      context.putImageData(source, 0, 0);
    } else {
      // Сжатие выполняется ступенями не более чем вдвое за шаг. Однократное
      // уменьшение в 4–5 раз (страница на 40 % рисуется в родном разрешении)
      // теряет тонкие штрихи: браузерные движки берут далеко не все пиксели
      // источника, и буквы выходят ступенчатыми. Пошаговое уменьшение вдвое
      // сохраняет штрихи, потому что на каждом шаге свёртка берёт все пиксели.
      const stage = document.createElement('canvas');
      let width = pixmap.width();
      let height = pixmap.height();
      stage.width = width;
      stage.height = height;
      stage.getContext('2d')?.putImageData(source, 0, 0);
      while (width > canvas.width * 2 && height > canvas.height * 2) {
        const next = document.createElement('canvas');
        width = Math.max(canvas.width, Math.round(width / 2));
        height = Math.max(canvas.height, Math.round(height / 2));
        next.width = width;
        next.height = height;
        const step = next.getContext('2d');
        if (!step) {
          break;
        }
        step.imageSmoothingEnabled = true;
        step.imageSmoothingQuality = 'high';
        step.drawImage(stage, 0, 0, width, height);
        stage.width = width;
        stage.height = height;
        stage.getContext('2d')?.drawImage(next, 0, 0);
      }
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(stage, 0, 0, canvas.width, canvas.height);
    }
    // Перекраска растра в тёмной теме: светлый фон страницы становится тёмным,
    // тёмный текст — светлым, оттенок сохраняется.
    recolorCanvas(canvas, state.readerTheme, state.pageColors);
    const zones = page.text_zones_json(dpi);
    if (zones) {
      // Слова строятся прямо в слое страницы: `buildTextLayer` собирает готовый
      // слой, и его нельзя вкладывать в другой — вложенный слой перекрывает
      // слова наружного, и выделение берёт не тот текст.
      const built = buildTextLayer(zones, pixelsPerCss, viewport);
      textLayerEl.append(...Array.from(built.childNodes));
    }
    // Готовые слои встают одним кадром: при перерисовке окна старый канвас
    // удерживался до этого момента, поэтому прокрутка не обнажает пустоту.
    // Отрисовка могла устареть, пока шла: масштаб сменили, и поколение другое.
    // Тогда готовые канвас и слой не вставляются — иначе в разметке оказались бы
    // два текстовых слоя, и выделение брало бы слова из прежнего, не совпадая с
    // видимыми буквами.
    if (token !== state.renderToken) {
      canvas.remove();
      textLayerEl.remove();
      return;
    }
    // Прежние канвас и слой страницы снимаются перед вставкой: страница могла
    // быть отрисована повторно без передачи старого канваса, и два текстовых
    // слоя в разметке перехватывали бы выделение — его слова относятся к
    // прежнему масштабу и не совпадают с видимыми буквами.
    for (const stale of Array.from(pageEl.querySelectorAll(`.${TEXT_LAYER_CLASS}`))) {
      stale.remove();
    }
    for (const stale of Array.from(pageEl.querySelectorAll('canvas'))) {
      stale.remove();
    }
    pageEl.insertBefore(canvas, overlay);
    pageEl.insertBefore(textLayerEl, overlay);
    // После вставки измеряется ширина текста: слой подгоняет слова по зонам,
    // а затем зоны ставятся по фактическим чернилам растра — иначе выделение
    // расходится с видимым текстом.
    fitTextLayer(textLayerEl);
    alignTextLayerToRaster(textLayerEl, canvas, state.readerTheme === 'dark');
    if (preserve) {
      preserve.canvas.remove();
      preserve.textLayer.remove();
    }
    state.rendered.set(pageEl, entry);
    pageEl.dataset.rendered = '1';
    drawNotes(pageEl, state.notes);
    // Слой выделения строится по положению текста: после отрисовки он
    // восстанавливается, если выделение ещё живо.
    renderSelection();
  } catch (error) {
    // Неудачная отрисовка не должна навсегда помечать страницу готовой: иначе
    // она останется белой и повторный рендер не запустится.
    if (state.rendered.get(pageEl) === entry) {
      state.rendered.delete(pageEl);
      delete pageEl.dataset.rendered;
    }
    canvas.remove();
    textLayerEl.remove();
    restoreRendered(pageEl, preserve);
  } finally {
    state.pending.delete(pageEl);
  }
}

/** Очередь страниц на отрисовку: видимые впереди, соседние — следом. */
interface QueueItem {
  /** Элемент страницы. */
  pageEl: HTMLElement;
  /** Прежний растр, который удерживается до готовности нового. */
  preserve: RenderedEntry | null;
}

let renderQueue: QueueItem[] = [];
/** Таймер продолжения очереди отрисовки. */
let renderTimer: ReturnType<typeof setTimeout> | null = null;
/** Таймер паузы после прокрутки: растр рисуется, когда прокрутка успокоилась. */
let settleTimer: ReturnType<typeof setTimeout> | null = null;

/** Постановка страницы в очередь, если её ещё нет. */
function enqueue(pageEl: HTMLElement, preserve: RenderedEntry | null = null): void {
  if (!renderQueue.some((item) => item.pageEl === pageEl)) {
    renderQueue.push({ pageEl, preserve });
  }
}

/**
 * Отрисовка очереди порциями.
 *
 * Одна порция ограничена по времени и обрабатывает страницы по одной: кадр не
 * блокируется, интерфейс отзывается на прокрутку и кнопки масштаба. Поколение
 * `renderToken` отменяет устаревшую очередь при смене масштаба.
 */
function runRenderQueue(): void {
  renderTimer = null;
  const token = state.renderToken;
  while (renderQueue.length > 0) {
    if (token !== state.renderToken) {
      renderQueue = [];
      return;
    }
    const item = renderQueue.shift() as QueueItem;
    if (
      !item.pageEl.isConnected ||
      state.rendered.has(item.pageEl) ||
      state.pending.has(item.pageEl)
    ) {
      continue;
    }
    renderPage(item.pageEl, item.preserve, token);
    // Одна страница за заход: следующая — в отдельном кадре. Отрисовка страницы
    // в WebKit занимает сотни миллисекунд, и несколько подряд заморозили бы
    // интерфейс на всё это время.
    break;
  }
  if (renderQueue.length > 0) {
    renderTimer = setTimeout(runRenderQueue, 16);
  }
}

/** Планирование очереди отрисовки (несколько страниц, но не одним кадром). */
function scheduleRenderQueue(): void {
  if (renderTimer !== null || renderQueue.length === 0) {
    return;
  }
  renderTimer = setTimeout(runRenderQueue, 0);
}

/** Отрисовка страниц виртуального окна: видимые впереди, соседние — следом.
 *
 * Во время прокрутки растр не рисуется: страницы окна только пересобираются, а
 * рисунок появляется после её окончания. Иначе тяжёлая отрисовка страницы
 * приходилась бы на каждый кадр прокрутки и она бы дёргалась.
 *
 * У готовой страницы проверяется, покрывает ли её канвас видимую часть: страница
 * выше области чтения рисуется окном, и прокрутка внутри неё уводит видимую часть
 * за пределы канваса. Без этой проверки низ страницы оставался бы нерисованным.
 */
function renderWindow(): void {
  const viewerRect = viewer.getBoundingClientRect();
  const visible: HTMLElement[] = [];
  const nearby: HTMLElement[] = [];
  const rerender: Array<[HTMLElement, RenderedEntry | null]> = [];
  for (let page = state.windowStart; page <= state.windowEnd; page += 1) {
    const pageEl = state.pages.get(page);
    if (!pageEl) {
      continue;
    }
    const rect = pageEl.getBoundingClientRect();
    const onScreen = rect.bottom > viewerRect.top && rect.top < viewerRect.bottom;
    if (!onScreen) {
      if (rect.bottom > viewerRect.top - 320 && rect.top < viewerRect.bottom + 320) {
        nearby.push(pageEl);
      } else {
        releasePage(pageEl);
      }
      continue;
    }
    const entry = state.rendered.get(pageEl);
    // Устаревшая раскраска: страница перерисовывается, а не показывается старой.
    const stalePaint = entry ? entry.paint !== state.paintKey : false;
    if (!entry || stalePaint || !coversVisible(rect, viewerRect, entry)) {
      // Старый канвас удерживается до готовности нового: иначе прокрутка
      // обнажала бы белый прямоугольник на время отрисовки.
      rerender.push([pageEl, detachForRerender(pageEl)]);
      continue;
    }
    visible.push(pageEl);
  }
  // Видимая нерисованная страница рисуется сразу: она перед глазами, и ждать
  // кадра очереди незачем. Остальные дорисуются из очереди по кадрам.
  renderQueue = [];
  for (let index = 0; index < rerender.length; index += 1) {
    const [pageEl, preserve] = rerender[index];
    if (index === 0) {
      renderPage(pageEl, preserve, state.renderToken);
    } else {
      enqueue(pageEl, preserve);
    }
  }
  for (const pageEl of visible) {
    if (!state.rendered.has(pageEl)) {
      enqueue(pageEl);
    }
  }
  for (const pageEl of nearby) {
    if (!state.rendered.has(pageEl)) {
      enqueue(pageEl);
    }
  }
  scheduleRenderQueue();
}

/** Покрывает ли канвас страницы её видимую часть (в CSS-пикселях страницы).
 *
 * Границы окна привязаны к сетке устройства и могут быть дробными, поэтому
 * сравнение идёт с допуском: иначе видимая часть, начинающаяся с нуля, не
 * покрывалась бы окном с границей 0.26 и страница перерисовывалась бы на каждом
 * пересчёте.
 */
const COVER_TOLERANCE = 1.5;

function coversVisible(
  rect: DOMRect,
  viewerRect: DOMRect,
  entry: RenderedEntry,
): boolean {
  const info = entry.info;
  const top = Math.max(rect.top, viewerRect.top) - rect.top;
  const bottom = Math.min(rect.bottom, viewerRect.bottom) - rect.top;
  const left = Math.max(rect.left, viewerRect.left) - rect.left;
  const right = Math.min(rect.right, viewerRect.right) - rect.left;
  return (
    top >= info.y - COVER_TOLERANCE &&
    bottom <= info.y + info.height + COVER_TOLERANCE &&
    left >= info.x - COVER_TOLERANCE &&
    right <= info.x + info.width + COVER_TOLERANCE
  );
}

/** Пересчёт окна страниц и их отрисовка (после прокрутки, масштаба, темы). */
export function refreshWindows(): void {
  state.windowScheduled = false;
  if (!state.doc) {
    return;
  }
  realizeWindow();
  renderWindow();
}

/** Планирование пересчёта окна после прокрутки. */
export function scheduleWindowRefresh(): void {
  if (state.windowScheduled) {
    return;
  }
  state.windowScheduled = true;
  requestAnimationFrame(refreshWindows);
}

/**
 * Уведомление о прокрутке: окно пересобирается сразу, а растр — после паузы.
 *
 * Пересборка окна дешёвая (несколько узлов), поэтому она идёт на каждом кадре и
 * место под страницы не «уезжает»; тяжёлая отрисовка откладывается, пока
 * прокрутка не успокоилась.
 */
export function notifyScrolling(): void {
  // Во время прокрутки пересобирается только окно страниц (дешёвая операция):
  // место под страницы обновляется сразу, а растр рисуется после её окончания.
  realizeWindow();
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
  }
  settleTimer = setTimeout(() => {
    settleTimer = null;
    refreshWindows();
  }, 90);
}

/** Пауза склейки серии нажатий, мс. */
const SETTLE_DELAY = 140;

/**
 * Отложенная отрисовка после серии изменений (например, нажатий масштаба).
 *
 * Пока пользователь подряд меняет масштаб, растр не рисуется: каждый вызов
 * сбрасывает паузу, и страницы приходят в новый масштаб один раз — по её
 * окончании. Так серия нажатий не запускает тяжёлую отрисовку на каждое.
 */
export function settleRender(): void {
  if (settleTimer !== null) {
    clearTimeout(settleTimer);
  }
  settleTimer = setTimeout(() => {
    settleTimer = null;
    refreshWindows();
  }, SETTLE_DELAY);
}

/** Доведение отрисовки после смены раскраски или возврата видимости.
 *
 * Устаревшие (под прежний отпечаток раскраски) страницы рисуются заново при
 * первой видимости. Пока область содержимого скрыта (открыт раздел настроек), у
 * неё нулевой размер — рисовать нечем, и пересчёт откладывается до появления
 * размера (сообщение `show` от хоста).
 */
export function repaintDirtyPages(): void {
  if (!state.doc) {
    return;
  }
  refreshWindows();
  scheduleWindowRefresh();
}

/** Высота списка страниц: используется для проверки раскладки. */
export function currentListHeight(): number {
  return listHeight();
}

/** Смещение страницы от начала списка: используется навигацией. */
export function offsetOfPage(page: number): number {
  return pageOffset(page);
}

/** Пробуждение прокрутки области после возврата видимости.
 *
 * В WebKitGTK область, чей предок побывал в `display: none`, после возврата может
 * перестать считаться прокручиваемой, хотя содержимое выше окна: колесо
 * прокручивает документ, а не страницу. Явная переустановка `overflow` заставляет
 * движок пересчитать прокручиваемое переполнение; положение прокрутки при этом
 * сохраняется.
 */
export function wakeViewerScroll(): void {
  const overflow = viewer.style.overflow;
  viewer.style.overflow = 'hidden';
  void viewer.offsetHeight;
  viewer.style.overflow = overflow;
}
