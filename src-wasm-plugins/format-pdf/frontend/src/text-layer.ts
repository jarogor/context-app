/** Текстовый слой страницы: совпадение с растром и разбор сканов.
 *
 * pdf.js раскладывает невидимый слой запасным шрифтом, а ширину строки
 * подгоняет сжатием. Здесь встроенные шрифты страницы ставятся вперёд запасных,
 * а у сканов (растр + невидимый текст) правый край строки подтягивается под
 * растр.
 */
import type { PdfPage, PdfTextContent } from './engine';

/** Кэш признака «скана с невидимым текстом» по номеру страницы. */
const invisibleScan = new Map<number, boolean>();

/**
 * Содержимое страницы со встроенными в PDF шрифтами в стилях.
 *
 * pdf.js отдаёт `styles[fontName].fontFamily` как `font.fallbackName`, а ширину
 * строки подгоняет сжатием. pdf.js уже регистрирует встроенный шрифт страницы
 * как `@font-face` под именем `fontName` (`loadedName`), поэтому достаточно
 * поставить его в начало `font-family`, оставив прежний шрифт запасным на случай
 * недоступных глифов (например, у скана со шрифтом без контуров).
 *
 * Вертикаль полос выделения и цитат от метрик шрифта не зависит: она приводится
 * к межстрочному шагу в `tileByLine`, поэтому низкие метрики встроенного шрифта
 * щелей между строками не дают.
 */
export async function textContentWithPageFonts(page: PdfPage): Promise<PdfTextContent> {
  const content = await page.getTextContent();
  for (const name of Object.keys(content.styles)) {
    const style = content.styles[name];
    if (style.fontFamily && !style.fontFamily.includes(`"${name}"`)) {
      style.fontFamily = `"${name}", ${style.fontFamily}`;
    }
  }
  return content;
}

/**
 * Признак «скан с невидимым текстовым слоем» по номеру страницы.
 *
 * Проверяются операции страницы: есть изображение, есть текст, и **весь** текст
 * рисуется невидимо (`rendering mode 3`). Только у таких страниц видимый текст —
 * это растр, и невидимый слой стоит подгонять под него. Признак постоянен для
 * страницы и держится в кэше.
 */
export async function isInvisibleScan(
  page: PdfPage,
  ops: Record<string, number>,
): Promise<boolean> {
  const number = page.pageNumber;
  if (invisibleScan.has(number)) {
    return invisibleScan.get(number) as boolean;
  }
  let result = false;
  try {
    const operations = await page.getOperatorList();
    let mode = 0;
    let images = 0;
    let texts = 0;
    let invisible = true;
    for (let index = 0; index < operations.fnArray.length; index += 1) {
      const fn = operations.fnArray[index];
      if (fn === ops.setTextRenderingMode) {
        mode = operations.argsArray[index][0] as number;
      } else if (fn === ops.showText) {
        texts += 1;
        if (mode !== 3) {
          invisible = false;
        }
      } else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject) {
        images += 1;
      }
    }
    result = images > 0 && texts > 0 && invisible;
  } catch (error) {
    // Не удалось разобрать операции — выравнивание не применяется.
    result = false;
  }
  invisibleScan.set(number, result);
  return result;
}

/** Ожидание готовности растра страницы перед его чтением.
 *
 * В WebKitGTK растр изображения (JPEG-скан, XObject `DCTDecode`) дорисовывается
 * в канвас **асинхронно уже после** `page.render().promise`: сразу после
 * отрисовки канвас может быть ещё белым. Тогда чтение пикселей не находит чернил,
 * и выравнивание невидимого слоя молча пропускается — выделение съезжает
 * относительно видимого текста. Ждём появления чернил, опрашивая кадры отрисовки
 * с ограничением по времени: страница без чернил (пустой скан) ожидание не
 * задерживает. Возвращает, дождались ли чернил.
 */
export async function waitForRasterInk(
  canvas: HTMLCanvasElement,
  maxWaitMillis = 500,
): Promise<boolean> {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    return false;
  }
  const stepX = Math.max(1, Math.floor(width / 128));
  const stepY = Math.max(1, Math.floor(height / 128));
  const started = performance.now();
  // «Чернилом» считается заметно тёмный непрозрачный пиксель — тот же признак,
  // что и в `alignTextLayer`, поэтому ожидание и выравнивание согласованы.
  const hasInk = (): boolean => {
    let context: CanvasRenderingContext2D | null = null;
    try {
      context = canvas.getContext('2d', { willReadFrequently: true }) || canvas.getContext('2d');
    } catch (error) {
      return false;
    }
    if (!context) {
      return false;
    }
    let pixels: Uint8ClampedArray;
    try {
      pixels = context.getImageData(0, 0, width, height).data;
    } catch (error) {
      // Песочница запретила чтение пикселей — выравнивание всё равно невозможно.
      return true;
    }
    for (let y = 0; y < height; y += stepY) {
      for (let x = 0; x < width; x += stepX) {
        const index = (y * width + x) * 4;
        if (
          pixels[index + 3] > 0 &&
          (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 < 150
        ) {
          return true;
        }
      }
    }
    return false;
  };
  for (;;) {
    if (hasInk()) {
      return true;
    }
    if (performance.now() - started >= maxWaitMillis) {
      return false;
    }
    await nextFrame();
  }
}

/** Ожидание одного кадра отрисовки.
 *
 * `requestAnimationFrame` в скрытом документе не срабатывает, поэтому рядом
 * стоит таймер-страховка: ожидание обязано завершиться даже без кадров.
 */
function nextFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }
      done = true;
      resolve();
    };
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(finish);
    }
    setTimeout(finish, 16);
  });
}

/**
 * Подгонка невидимого текстового слоя под растр скана.
 *
 * У строки выравнивается её последний span: невидимый слой не доходит до растра
 * именно на правом краю строки, а середина и так совпадает. Растягивается
 * собственный масштаб span'а (`scaleX`) — буквы остаются невидимы, меняется лишь
 * ширина прямоугольника выделения, поэтому переносы строк не затрагиваются.
 * Правый край строки — конец последнего «пятна» чернил (цепочки столбцов, где
 * пробелы короче 0.7 кегля перешагиваются). Строки с горизонтальной линейкой и
 * промахи за пределами разумного растяжения пропускаются.
 *
 * Возвращает число выровненных span'ов.
 */
export function alignTextLayer(
  textLayerEl: HTMLElement,
  canvas: HTMLCanvasElement,
  pageBounds: DOMRect,
): number {
  const canvasRect = canvas.getBoundingClientRect();
  const ratio = canvasRect.width > 0 ? canvas.width / canvasRect.width : 1;
  const cw = canvas.width;
  const ch = canvas.height;
  if (cw <= 0 || ch <= 0 || ratio <= 0) {
    return 0;
  }
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      context = canvas.getContext('2d');
    }
  } catch (error) {
    return 0;
  }
  if (!context) {
    return 0;
  }
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, cw, ch).data;
  } catch (error) {
    // Песочница запретила чтение пикселей — выравнивание невозможно.
    return 0;
  }
  const isInk = (x: number, y: number): boolean => {
    const index = (y * cw + x) * 4;
    return (
      pixels[index + 3] > 0 &&
      (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3 < 150
    );
  };
  // Строки слоя: спаны с заметным вертикальным перекрытием — одна строка (как в
  // `tileByLine`). У каждой строки запоминается её самый правый span — именно он
  // не доходит до растра на правом краю.
  const items: { span: HTMLElement; rect: DOMRect }[] = [];
  for (const span of textLayerEl.querySelectorAll('span')) {
    if (!span || (span.textContent || '').trim().length <= 1) {
      continue;
    }
    const rect = (span as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    items.push({ span: span as HTMLElement, rect });
  }
  items.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const lines: { top: number; bottom: number; tail: { span: HTMLElement; rect: DOMRect } }[] = [];
  for (const item of items) {
    const line = lines[lines.length - 1];
    if (line) {
      const overlap =
        Math.min(line.bottom, item.rect.bottom) - Math.max(line.top, item.rect.top);
      const minHeight = Math.min(line.bottom - line.top, item.rect.height);
      if (overlap > minHeight * 0.5) {
        line.top = Math.min(line.top, item.rect.top);
        line.bottom = Math.max(line.bottom, item.rect.bottom);
        if (item.rect.right > line.tail.rect.right) {
          line.tail = item;
        }
        continue;
      }
    }
    lines.push({ top: item.rect.top, bottom: item.rect.bottom, tail: item });
  }
  let aligned = 0;
  for (const { tail } of lines) {
    const { span, rect } = tail;
    const fontSize = parseFloat(getComputedStyle(span).fontSize) || 0;
    if (fontSize <= 0) {
      continue;
    }
    const y0 = Math.max(0, Math.floor((rect.top - canvasRect.top) * ratio));
    const y1 = Math.min(ch - 1, Math.ceil((rect.bottom - canvasRect.top) * ratio));
    const x0 = Math.max(0, Math.floor((rect.left - canvasRect.left) * ratio));
    const x1 = cw - 1;
    if (x0 > x1 || y0 > y1) {
      continue;
    }
    // Столбцы чернил в полосе строки и заполненность её строк (для отсева
    // горизонтальных линеек: у них почти вся полоса закрашена).
    const columns = new Uint8Array(x1 - x0 + 1);
    const rowInk = new Int32Array(y1 - y0 + 1);
    for (let x = x0; x <= x1; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (isInk(x, y)) {
          columns[x - x0] = 1;
          rowInk[y - y0] += 1;
        }
      }
    }
    const bandWidth = x1 - x0 + 1;
    let ruled = false;
    for (const count of rowInk) {
      if (count > bandWidth * 0.7) {
        ruled = true;
        break;
      }
    }
    if (ruled) {
      continue;
    }
    // От правого края букв самого span'а идём вправо, перешагивая пробелы
    // (промежутки короче 0.7 кегля), и обрываемся на длинном разрыве: так правый
    // край строки — конец последнего пятна, а сноска справа не приклеивается.
    const maxGap = Math.max(2, Math.round(0.7 * fontSize * ratio));
    const spanBoxRight = Math.min(
      columns.length - 1,
      Math.ceil((rect.right - canvasRect.left) * ratio) - x0,
    );
    let anchor = -1;
    for (let x = spanBoxRight; x >= 0; x -= 1) {
      if (columns[x] === 1) {
        anchor = x;
        break;
      }
    }
    // В буквах последнего span'а нет чернил — выравнивать не по чему.
    if (anchor < 0) {
      continue;
    }
    let runEnd = anchor;
    let gap = 0;
    for (let x = anchor + 1; x < columns.length; x += 1) {
      if (columns[x] === 1) {
        runEnd = x;
        gap = 0;
      } else if (++gap > maxGap) {
        break;
      }
    }
    // Обрыв у границы канваса означает, что пятно не окончено: правый край
    // строки неизвестен, выравнивать не по чему.
    if (runEnd >= columns.length - 1) {
      continue;
    }
    const pageWidth = pageBounds.width;
    const inkRight =
      ((x0 + runEnd + 1) / ratio + canvasRect.left - pageBounds.left) / pageWidth;
    const spanLeft = (rect.left - pageBounds.left) / pageWidth;
    const spanRight = (rect.right - pageBounds.left) / pageWidth;
    const spanWidth = spanRight - spanLeft;
    const inkWidth = inkRight - spanLeft;
    // Правый край растягивается от левого (он совпадает): короткий слой
    // подтягивается к расту, а выступы и промахи не трогаются.
    if (spanWidth <= 0.001 || inkWidth <= spanWidth) {
      continue;
    }
    const ratioToInk = inkWidth / spanWidth;
    if (ratioToInk > 1.3) {
      continue;
    }
    const matrix = getComputedStyle(span).transform;
    const base =
      matrix === 'none'
        ? [1, 0, 0, 1, 0, 0]
        : matrix
            .slice(matrix.indexOf('(') + 1, -1)
            .split(',')
            .map(Number);
    if (!base[0]) {
      continue;
    }
    span.style.transformOrigin = '0% 0%';
    span.style.transform = `matrix(${base[0] * ratioToInk}, ${base[1]}, ${base[2]}, ${base[3]}, ${base[4]}, ${base[5]})`;
    aligned += 1;
  }
  return aligned;
}
