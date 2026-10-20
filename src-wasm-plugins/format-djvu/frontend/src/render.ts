/** Отрисовка страниц книги и окон канваса.
 *
 * Страница DjVu рисуется растром с плотностью экрана; обычные масштабы
 * помещаются в канвас целиком, сильное увеличение — окном видимой области с
 * запасом. Рядом с растром идёт невидимый текстовый слой, поверх — подсветки
 * заметок и слой выделения.
 */
import { newPixmap, renderRequest, type DjVuPage } from './engine';
import { OVERLAY_CLASS, TEXT_LAYER_CLASS, overlayOf, pagesEl, scrollProgress, viewer } from './dom';
import { drawNotes } from './notes';
import { post } from './protocol';
import { renderSelection } from './selection';
import { state, type CanvasInfo, type RenderedEntry } from './state';
import { buildTextLayer } from './text-layer';
import { recolorCanvas } from './theme';
import {
  boundedRatio,
  desiredWindow,
  snapToDevice,
  type WindowBox,
} from './viewport';

/** Порядковый номер страницы элемента (1-based). */
function pageNumber(pageEl: HTMLElement): number {
  return Number(pageEl.dataset.page);
}

/** Масштаб отображения: 100 % — естественный размер страницы файла. */
function zoomScale(): number {
  return state.zoom / 100;
}

/** Размер страницы в пикселях при текущем масштабе. */
export function pageSize(index: number): { width: number; height: number } {
  const natural = state.naturalSizes[index] ||
    state.naturalSizes[0] || { width: 612, height: 792 };
  const scale = zoomScale();
  return { width: natural.width * scale, height: natural.height * scale };
}

/** Обновление размеров страницы после уточнения её натурального размера. */
function resizePage(index: number): void {
  const pageEl = pagesEl.children[index] as HTMLElement | undefined;
  if (!pageEl || pageEl.dataset.rendered === '1') {
    return;
  }
  const size = pageSize(index);
  pageEl.style.width = size.width + 'px';
  pageEl.style.height = size.height + 'px';
}

/** Подготовка канваса страницы: окно и плотность. */
function setupCanvas(pageEl: HTMLElement, viewport: { width: number; height: number }): {
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
  const ratio = boundedRatio(base.width, base.height, window.devicePixelRatio || 1);
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

/** Сообщение о текущей странице, числе страниц, масштабе и прогрессе. */
export function reportState(): void {
  post({
    type: 'state',
    value: { page: state.currentPage, pages: state.pageCount, zoom: state.zoom },
  });
  post({ type: 'progress', value: scrollProgress() });
}

/** Построение каркаса страниц: размеры без растров. */
export function layoutPages(): void {
  pagesEl.replaceChildren();
  for (let index = 0; index < state.pageCount; index += 1) {
    const size = pageSize(index);
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    pageEl.dataset.page = String(index + 1);
    pageEl.style.width = size.width + 'px';
    pageEl.style.height = size.height + 'px';
    const overlay = document.createElement('div');
    overlay.className = OVERLAY_CLASS;
    pageEl.append(overlay);
    pagesEl.append(pageEl);
  }
}

/** Обновление размеров каркаса при смене масштаба. */
export function resizePages(): void {
  for (const node of pagesEl.children) {
    const pageEl = node as HTMLElement;
    const index = pageNumber(pageEl) - 1;
    const size = pageSize(index);
    pageEl.style.width = size.width + 'px';
    pageEl.style.height = size.height + 'px';
  }
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
  return entry || null;
}

/** Возврат ранее откреплённого канваса, если новая отрисовка не удалась. */
function restoreRendered(pageEl: HTMLElement, entry: RenderedEntry | null): void {
  if (entry && pageEl.isConnected && !state.rendered.has(pageEl)) {
    state.rendered.set(pageEl, entry);
    pageEl.dataset.rendered = '1';
  }
}

/** Целевой DPI отрисовки страницы: природный DPI × масштаб × плотность. */
function targetDpi(index: number, ratio: number): number {
  const native = state.nativeDpis[index] || 300;
  return Math.max(1, Math.round(native * zoomScale() * ratio));
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
  const nativeDpi = page.dpi() || 300;
  state.nativeDpis[index] = nativeDpi;
  state.naturalSizes[index] = {
    width: page.width_at(nativeDpi),
    height: page.height_at(nativeDpi),
  };
  resizePage(index);
  const viewport = pageSize(index);
  pageEl.style.width = viewport.width + 'px';
  pageEl.style.height = viewport.height + 'px';

  const setup = setupCanvas(pageEl, viewport);
  const canvas = setup.canvas;
  const info = setup.info;
  const context = canvas.getContext('2d');
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
    const dpi = targetDpi(index, info.ratio);
    const request = renderRequest(dpi);
    const whole =
      Math.abs(info.x) < 0.5 &&
      Math.abs(info.y) < 0.5 &&
      Math.abs(info.width * info.ratio - page.width_at(dpi)) <= 1 &&
      Math.abs(info.height * info.ratio - page.height_at(dpi)) <= 1;
    if (!whole) {
      const pageWidth = page.width_at(dpi);
      const pageHeight = page.height_at(dpi);
      const x = Math.min(Math.max(0, Math.round(info.x * info.ratio)), pageWidth - 1);
      const y = Math.min(Math.max(0, Math.round(info.y * info.ratio)), pageHeight - 1);
      const width = Math.min(
        Math.max(1, Math.round(info.width * info.ratio)),
        pageWidth - x,
      );
      const height = Math.min(
        Math.max(1, Math.round(info.height * info.ratio)),
        pageHeight - y,
      );
      request.set_region(x, y, width, height);
    }
    const pixmap = newPixmap();
    page.render_request(request, pixmap);
    const pixels = new Uint8ClampedArray(pixmap.view());
    context.putImageData(new ImageData(pixels, pixmap.width(), pixmap.height()), 0, 0);
    // Перекраска растра в тёмной теме: светлый фон страницы становится тёмным,
    // тёмный текст — светлым, оттенок сохраняется.
    recolorCanvas(canvas, state.readerTheme, state.pageColors);
    const zones = page.text_zones_json(dpi);
    if (zones) {
      textLayerEl.append(buildTextLayer(zones, info.ratio, viewport));
    }
    // Готовые слои встают одним кадром: при перерисовке окна старый канвас
    // удерживался до этого момента, поэтому прокрутка не обнажает пустоту.
    pageEl.insertBefore(canvas, overlay);
    pageEl.insertBefore(textLayerEl, overlay);
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

/** Наблюдение за видимостью страниц: рендер вблизи, освобождение вдали. */
export function startObserver(): void {
  if (state.observer) {
    state.observer.disconnect();
  }
  state.observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pageEl = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          renderPage(pageEl);
        } else if (entry.intersectionRatio === 0) {
          releasePage(pageEl);
        }
      }
    },
    { root: viewer, rootMargin: '1200px 0px' },
  );
  for (const pageEl of pagesEl.children) {
    state.observer.observe(pageEl);
  }
}

/** Пересчёт окон отрисованных страниц при прокрутке.
 *
 * Когда страница рисуется целиком (обычные масштабы), видимая область всегда
 * внутри её канваса, и перерисовки при прокрутке не происходит. Когда страница
 * целиком не помещается и нарисована окном, прокрутка, уводящая видимую область
 * за пределы окна, освобождает страницу и рисует её заново под новое положение.
 */
export function refreshWindows(): void {
  state.windowScheduled = false;
  const viewerRect = viewer.getBoundingClientRect();
  for (const node of pagesEl.children) {
    const pageEl = node as HTMLElement;
    const index = pageNumber(pageEl) - 1;
    if (!state.naturalSizes[index]) {
      continue;
    }
    const rect = pageEl.getBoundingClientRect();
    const interTop = Math.max(rect.top, viewerRect.top);
    const interBottom = Math.min(rect.bottom, viewerRect.bottom);
    const interLeft = Math.max(rect.left, viewerRect.left);
    const interRight = Math.min(rect.right, viewerRect.right);
    if (interBottom <= interTop || interRight <= interLeft) {
      continue;
    }
    const entry = state.rendered.get(pageEl);
    // Растр под прежний отпечаток раскраски (смена темы/палитры в скрытой области
    // или на другой странице) устарел: перерисовываем при первой видимости — и
    // при прокрутке, и при переходе на страницу. Старый канвас удерживается до
    // готовности нового, чтобы не обнажать пустоту.
    const stalePaint = entry ? entry.paint !== state.paintKey : false;
    if (!entry || stalePaint) {
      const stale = entry ? detachForRerender(pageEl) : null;
      renderPage(pageEl, stale);
      continue;
    }
    // Видимая область и окно канваса — в одной системе: CSS-пиксели относительно
    // страницы.
    const visTop = interTop - rect.top;
    const visBottom = interBottom - rect.top;
    const visLeft = interLeft - rect.left;
    const visRight = interRight - rect.left;
    const info = entry.info;
    const covered =
      visTop >= info.y &&
      visBottom <= info.y + info.height &&
      visLeft >= info.x &&
      visRight <= info.x + info.width;
    if (!covered) {
      // Старый канвас удерживается до готовности нового: иначе прокрутка
      // обнажала бы белый прямоугольник на время отрисовки.
      const stale = detachForRerender(pageEl);
      renderPage(pageEl, stale);
    }
  }
}

/** Планирование пересчёта окон после прокрутки. */
export function scheduleWindowRefresh(): void {
  if (state.windowScheduled) {
    return;
  }
  state.windowScheduled = true;
  requestAnimationFrame(refreshWindows);
}

/** Доведение отрисовки после смены раскраски или возврата видимости.
 *
 * Растр перекрашивается при отрисовке: устаревшие (под прежний отпечаток)
 * страницы рисуются заново при первой видимости. Пока область содержимого скрыта
 * (открыт раздел настроек), у неё нулевой размер — рисовать нечем, и пересчёт окон
 * откладывается до появления размера (сообщение `show` от хоста или наблюдатель
 * размера).
 */
export function repaintDirtyPages(): void {
  if (!state.doc) {
    return;
  }
  refreshWindows();
  scheduleWindowRefresh();
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
