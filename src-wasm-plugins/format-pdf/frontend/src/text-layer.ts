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
 * Ожидание готовности шрифтов страницы.
 *
 * Ширину невидимой строки pdf.js подгоняет сжатием (`scaleX`), измеряя текст
 * через `canvas.measureText` **в момент раскладки**. Если встроенный шрифт к этому
 * моменту ещё не загружен, замер идёт запасным шрифтом, и буквы внутри строки
 * уезжают относительно видимого текста — выделение не совпадает с ним. В Chromium
 * запасной шрифт близок к встроенному и расхождение незаметно, в WebKitGTK — нет,
 * поэтому одной отрисовки недостаточно: шрифт нужно дождаться явно.
 *
 * Ожидание ограничено по времени: недоступный или битый шрифт не должен
 * задерживать показ страницы, а раскладка просто пойдёт запасным.
 */
export async function waitForPageFonts(
  content: PdfTextContent,
  maxWaitMillis = 1500,
): Promise<void> {
  const names = Object.keys(content.styles);
  if (names.length === 0) {
    return;
  }
  try {
    const loads = names.map((name) =>
      document.fonts.load(`1em "${name}"`).catch(() => undefined),
    );
    await Promise.race([
      Promise.all(loads),
      new Promise<void>((resolve) => setTimeout(resolve, maxWaitMillis)),
    ]);
  } catch (error) {
    // Отсутствие Font Loading API не мешает: раскладка идёт как раньше.
  }
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
 * Невидимый слой скана не совпадает с растром по горизонтали: он раскладывается
 * запасным шрифтом, а ширина строки подгоняется сжатием, поэтому **все** слова
 * строки короче видимых, а не только последнее. Здесь строка целиком
 * растягивается от её левого края до правого края чернил растра: каждый span
 * строки сдвигается и растягивается пропорционально (`k = чернила / строка`),
 * поэтому любое слово — и в начале, и в середине, и в конце — снова ложится на
 * свой видимый фрагмент, а не только хвост строки. Растягивается собственный
 * масштаб span'а (`scaleX`) и его левый отступ; буквы остаются невидимы, меняется
 * лишь ширина и положение прямоугольников выделения, поэтому переносы строк не
 * затрагиваются.
 *
 * Правый край строки — конец последнего «пятна» чернил (цепочки столбцов, где
 * пробелы короче 0.7 кегля перешагиваются). Строки с горизонтальной линейкой и
 * промахи за пределами разумного растяжения пропускаются.
 *
 * `dark` переключает признак чернил: на тёмной странице (перекрашенной под тему)
 * текст светлый, а бумага тёмная, поэтому «чернилом» считается светлый пиксель.
 *
 * Возвращает число выровненных строк; `0` означает, что чернил не нашлось и
 * ничего не изменено — тогда выравнивание можно безопасно повторить.
 */
export function alignTextLayer(
  textLayerEl: HTMLElement,
  canvas: HTMLCanvasElement,
  pageBounds: DOMRect,
  dark = false,
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
    if (pixels[index + 3] === 0) {
      return false;
    }
    const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
    return dark ? luminance > 150 : luminance < 150;
  };
  // Строки слоя: спаны с заметным вертикальным перекрытием — одна строка (как в
  // `tileByLine`). Собираются **все** спаны строки, а не только последний: сжатие
  // слоя неоднородно по строке, и выравнивать нужно каждое слово.
  const measured: { span: HTMLElement; rect: DOMRect }[] = [];
  for (const span of textLayerEl.querySelectorAll('span')) {
    if (!span || (span.textContent || '').trim().length <= 1) {
      continue;
    }
    const rect = (span as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }
    measured.push({ span: span as HTMLElement, rect });
  }
  measured.sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);
  const lines: { top: number; bottom: number; spans: { span: HTMLElement; rect: DOMRect }[] }[] = [];
  for (const item of measured) {
    const line = lines[lines.length - 1];
    if (line) {
      const overlap =
        Math.min(line.bottom, item.rect.bottom) - Math.max(line.top, item.rect.top);
      const minHeight = Math.min(line.bottom - line.top, item.rect.height);
      if (overlap > minHeight * 0.5) {
        line.top = Math.min(line.top, item.rect.top);
        line.bottom = Math.max(line.bottom, item.rect.bottom);
        line.spans.push(item);
        continue;
      }
    }
    lines.push({ top: item.rect.top, bottom: item.rect.bottom, spans: [item] });
  }
  let aligned = 0;
  for (const line of lines) {
    const fontSize = parseFloat(getComputedStyle(line.spans[0].span).fontSize) || 0;
    if (fontSize <= 0) {
      continue;
    }
    const y0 = Math.max(0, Math.floor((line.top - canvasRect.top) * ratio));
    const y1 = Math.min(ch - 1, Math.ceil((line.bottom - canvasRect.top) * ratio));
    if (y0 > y1) {
      continue;
    }
    // Столбцы чернил в полосе строки и заполненность её строк (для отсева
    // горизонтальных линеек: у них почти вся полоса закрашена).
    const bandTop = Math.min(...line.spans.map((item) => item.rect.left));
    const x0 = Math.max(0, Math.floor((bandTop - canvasRect.left) * ratio) - 1);
    const x1 = cw - 1;
    if (x0 > x1) {
      continue;
    }
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
    const pageWidth = pageBounds.width;
    // От правого края букв самого правого span'а идём вправо, перешагивая пробелы
    // (промежутки короче 0.7 кегля), и обрываемся на длинном разрыве: так правый
    // край строки — конец последнего пятна, а сноска справа не приклеивается.
    const tail = line.spans.reduce((a, b) => (b.rect.right > a.rect.right ? b : a));
    const maxGap = Math.max(2, Math.round(0.7 * fontSize * ratio));
    const spanBoxRight = Math.min(
      columns.length - 1,
      Math.ceil((tail.rect.right - canvasRect.left) * ratio) - x0,
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
    const inkRight =
      ((x0 + runEnd + 1) / ratio + canvasRect.left - pageBounds.left) / pageWidth;
    const lineLeft = Math.min(...line.spans.map((item) => item.rect.left));
    const lineRight = Math.max(...line.spans.map((item) => item.rect.right));
    const lineStart = (lineLeft - pageBounds.left) / pageWidth;
    const lineEnd = (lineRight - pageBounds.left) / pageWidth;
    const lineWidth = lineEnd - lineStart;
    const inkWidth = inkRight - lineStart;
    // Строка растягивается целиком от левого края (он совпадает): короткий слой
    // подтягивается к расту, а выступы и промахи не трогаются. Пропорция по
    // строке сохраняет взаимное положение слов внутри неё, поэтому выделение
    // совпадает с видимым текстом и в начале, и в середине, и в конце строки.
    if (lineWidth <= 0.001 || inkWidth <= lineWidth) {
      continue;
    }
    const ratioToInk = inkWidth / lineWidth;
    if (ratioToInk > 1.4) {
      continue;
    }
    let changed = false;
    for (const item of line.spans) {
      const matrix = getComputedStyle(item.span).transform;
      const base =
        matrix === 'none'
          ? [1, 0, 0, 1, 0, 0]
          : matrix
              .slice(matrix.indexOf('(') + 1, -1)
              .split(',')
              .map(Number);
      // Поворот и наклон не трогаются: пропорциональный сдвиг верен только для
      // горизонтальной строки без наклона.
      if (!base[0] || base[1] !== 0 || base[2] !== 0) {
        continue;
      }
      const spanLeft = (item.rect.left - pageBounds.left) / pageWidth;
      const newLeft = lineStart + (spanLeft - lineStart) * ratioToInk;
      item.span.style.left = `${newLeft * pageWidth}px`;
      item.span.style.transformOrigin = '0% 0%';
      item.span.style.transform = `matrix(${base[0] * ratioToInk}, ${base[1]}, ${base[2]}, ${base[3]}, ${base[4]}, ${base[5]})`;
      changed = true;
    }
    if (changed) {
      aligned += 1;
    }
  }
  return aligned;
}
