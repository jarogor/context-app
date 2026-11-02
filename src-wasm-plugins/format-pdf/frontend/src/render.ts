/** Отрисовка страниц книги и окон канваса.
 *
 * Страница рисуется растром с плотностью экрана; обычные масштабы помещаются в
 * канвас целиком, сильное увеличение — окном видимой области с запасом. Рядом с
 * растром идёт невидимый текстовый слой pdf.js, поверх — подсветки заметок и
 * слой выделения.
 */
import { engine, type PdfJsModule, type PdfPage, type PdfTextContent } from './engine';
import { OVERLAY_CLASS, TEXT_LAYER_CLASS, overlayOf, pagesEl, scrollProgress, viewer } from './dom';
import { clearLinkLayer, renderLinks } from './links';
import { drawNotes } from './notes';
import { post } from './protocol';
import { renderSelection } from './selection';
import { state, type CanvasInfo, type RenderedEntry } from './state';
import { alignTextLayer, isInvisibleScan, textContentWithPageFonts, waitForPageFonts, waitForRasterInk } from './text-layer';
import { markPage } from './search';
import { drawAnnotations } from './annotations';
import { recolorCanvas } from './theme';
import {
  boundedRatio,
  currentScale,
  desiredWindow,
  snapToDevice,
  type WindowBox,
} from './viewport';

/** Отрисовка канваса и текстового слоя страницы.
 *
 * Старый канвас при повторной отрисовке окна (`preserve`) остаётся видимым, пока
 * новый не готов: прокрутка внутри большой страницы иначе обнажала бы белый
 * прямоугольник.
 */

/** Порядковый номер страницы элемента (1-based). */
function pageNumber(pageEl: HTMLElement): number {
  return Number(pageEl.dataset.page);
}

/** Размер страницы в пикселях при текущем масштабе. */
export function pageSize(index: number): { width: number; height: number } {
  const natural = state.naturalSizes[index] ||
    state.naturalSizes[0] || { width: 612, height: 792 };
  const scale = currentScale(state.zoom);
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

/** Подготовка канваса страницы: окно и плотность.
 *
 * Канвас рисуется в пикселях с плотностью экрана: вся страница, если её растр
 * помещается в пределы канваса (обычные масштабы), иначе — окно видимой области
 * с запасом (сильное увеличение). Геометрия задаётся до отрисовки: изменение
 * размеров канваса после неё стёрло бы рисунок. Границы окна привязаны к
 * пиксельной сетке устройства по абсолютной экранной позиции: сама страница
 * стоит в дробной координате, поэтому иначе браузер пересэмплирует растр и текст
 * мутнеет.
 */
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
  clearLinkLayer(pageEl);
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

/** Выравнивание невидимого слоя скана после того, как растр готов.
 *
 * Выравнивание читает пиксели растра, но `page.render().promise` завершается
 * ещё до того, как движок дорисовал изображение скана: раннее чтение нашло бы
 * белую страницу. Поэтому первый проход пробует выровнять слой, а если чернил
 * не нашлось (функция вернула `0`), ждёт появления растра и повторяет. Так
 * выравнивание либо срабатывает по готовому растру, либо, при нечитаемых
 * пикселях, молча пропускается.
 */
async function alignWhenRasterReady(
  pageEl: HTMLElement,
  textLayerEl: HTMLElement,
  canvas: HTMLCanvasElement,
): Promise<void> {
  const dark = state.readerTheme === 'dark';
  if (alignTextLayer(textLayerEl, canvas, pageEl.getBoundingClientRect(), dark) > 0) {
    return;
  }
  const ready = await waitForRasterInk(canvas);
  if (!ready) {
    return;
  }
  alignTextLayer(textLayerEl, canvas, pageEl.getBoundingClientRect(), dark);
}

/** Отрисовка страницы: окно канваса, текстовый слой, подсветки заметок.
 *
 * При повторной отрисовке окна (`preserve`) новый канвас рисуется откреплённым и
 * вставляется только после готовности: старый остаётся видимым, поэтому прокрутка
 * не обнажает белый прямоугольник.
 */
export async function renderPage(
  pageEl: HTMLElement,
  preserve: RenderedEntry | null = null,
): Promise<void> {
  const doc = state.doc;
  if (state.rendered.has(pageEl) || state.pending.has(pageEl) || !doc) {
    restoreRendered(pageEl, preserve);
    return;
  }
  const index = pageNumber(pageEl) - 1;
  const epoch = state.renderEpoch;
  state.pending.add(pageEl);
  let page: PdfPage;
  try {
    page = await doc.getPage(index + 1);
  } catch (error) {
    state.pending.delete(pageEl);
    restoreRendered(pageEl, preserve);
    return;
  }
  if (!pageEl.isConnected || epoch !== state.renderEpoch) {
    state.pending.delete(pageEl);
    restoreRendered(pageEl, preserve);
    return;
  }
  const lib = engine() as PdfJsModule | null;
  if (!lib) {
    state.pending.delete(pageEl);
    restoreRendered(pageEl, preserve);
    return;
  }
  const base = page.getViewport({ scale: 1 });
  state.naturalSizes[index] = { width: base.width, height: base.height };
  resizePage(index);
  const scale = currentScale(state.zoom);
  const viewport = page.getViewport({ scale });
  pageEl.style.width = viewport.width + 'px';
  pageEl.style.height = viewport.height + 'px';
  pageEl.style.setProperty('--scale-factor', String(scale));

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

  // Дополнительное преобразование сдвигает страницу в начало координат окна (её
  // левый верх не совпадает с углом страницы) и задаёт плотность экрана: без него
  // рисовалась бы левая верхняя часть страницы в неверном масштабе.
  const transform = [
    info.ratio,
    0,
    0,
    info.ratio,
    -info.x * info.ratio,
    -info.y * info.ratio,
  ];

  try {
    // Рисуем во **откреплённый** канвас: pdf.js последовательно заливает его
    // фоном и содержимым, и, будь он в DOM, на экране мелькала бы белая страница
    // до перекраски. Готовый канвас вставляется одним кадром.
    // Аннотации в растр не входят: встроенные в файл пометки — чужой слой,
    // сделанный неизвестно кем, и по умолчанию их не показывают. Они
    // включаются по одной из панели свойств и рисуются своим слоем.
    await page.render({ canvasContext: context, viewport, transform, annotationMode: 0 }).promise;
    if (epoch !== state.renderEpoch) {
      throw new Error('отрисовка устарела из-за смены масштаба');
    }
    // Скан (растр + невидимый слой): встроенный шрифт страницы — пустой «без
    // контуров», его подстановка сдвинула бы вертикаль слоя, поэтому у сканов
    // слой строится как раньше, а подгоняется по растру ниже.
    const scan = await isInvisibleScan(page, lib.OPS as unknown as Record<string, number>);
    // Растр скана в WebKitGTK дорисовывается в канвас уже после `render().promise`.
    // Пока изображение не готово, канвас белый: любое чтение пикселей ниже
    // (перекраска под тему, выравнивание слоя) работало бы по пустому кадру —
    // перекраска затёрла бы белый в тёмный, а выравнивание пропустилось бы, и
    // выделение съезжало бы относительно видимого текста. Ждём растр один раз,
    // до обоих чтений. Для цифровых страниц (вектор) ожидание не нужно.
    if (scan) {
      await waitForRasterInk(canvas);
    }
    // Перекраска растра в тёмной теме: светлый фон страницы становится тёмным,
    // тёмный текст — светлым, оттенок сохраняется.
    recolorCanvas(canvas, state.readerTheme, state.pageColors);
    let textContentSource: PdfTextContent | ReadableStream<Uint8Array> =
      page.streamTextContent() as unknown as ReadableStream<Uint8Array>;
    if (!scan) {
      // Встроенные шрифты страницы ставятся вперёд запасных: так буквы невидимого
      // слоя идут по метрикам PDF, а не подстановки. Шрифты дожидаются **до**
      // раскладки: pdf.js меряет ширину строки в момент раскладки, и незагруженный
      // встроенный шрифт дал бы замер запасным — буквы внутри строки уехали бы
      // относительно видимого текста (в WebKitGTK заметно, в Chromium почти нет).
      const content = await textContentWithPageFonts(page);
      await waitForPageFonts(content);
      textContentSource = content;
    }
    const textLayer = new lib.TextLayer({
      textContentSource: textContentSource as never,
      container: textLayerEl,
      viewport,
    });
    await textLayer.render();
    if (epoch !== state.renderEpoch) {
      throw new Error('отрисовка устарела из-за смены масштаба');
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
    // Выравнивание слоя по растру: и у сканов (невидимый текст под картинкой),
    // и у цифровых страниц, где слой разошёлся с видимым текстом из-за метрик
    // шрифта. Возможно только после вставки в документ: у откреплённых узлов нет
    // геометрии.
    await alignWhenRasterReady(pageEl, textLayerEl, canvas);
    // Ссылки страницы (оглавление, сноски) — аннотации PDF: растр и текстовый
    // слой их не содержат, поэтому слой строится отдельно.
    await renderLinks(doc, page, pageEl, viewport);
    drawNotes(pageEl, state.notes);
    // Встроенные пометки файла лежат отдельным слоем: по умолчанию их нет, они
    // появляются только по запросу из панели свойств.
    drawAnnotations(pageEl);
    // Найденное поиском отмечается на каждой отрисованной странице: поиск
    // может идти по книге параллельно с чтением.
    markPage(pageEl);
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
          void renderPage(pageEl);
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
      void renderPage(pageEl, stale);
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
      void renderPage(pageEl, stale);
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
