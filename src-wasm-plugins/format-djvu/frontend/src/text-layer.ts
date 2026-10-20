/** Невидимый текстовый слой страницы DjVu.
 *
 * DjVu хранит текст зонами (слово или строка) с координатами в пикселях
 * отрисованной страницы. Зона становится прозрачным `span` в тех же координатах:
 * браузерное выделение и восстановление концов цитаты работают по DOM, как в
 * PDF-плагине. У страницы без текстового слоя слой остаётся пустым.
 */

/** Зона текста из `text_zones_json` движка. */
export interface TextZone {
  /** Текст зоны. */
  t: string;
  /** Координата X в пикселях отрисованной страницы. */
  x: number;
  /** Координата Y в пикселях отрисованной страницы. */
  y: number;
  /** Ширина зоны в пикселях. */
  w: number;
  /** Высота зоны в пикселях. */
  h: number;
}

/** Разбор JSON зон текста; некорректные записи отбрасываются. */
export function parseTextZones(json: string): TextZone[] {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const zones: TextZone[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    const text = typeof record.t === 'string' ? record.t : '';
    const x = Number(record.x);
    const y = Number(record.y);
    const w = Number(record.w);
    const h = Number(record.h);
    if (!text.trim() || ![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) {
      continue;
    }
    zones.push({ t: text, x, y, w, h });
  }
  return zones;
}

/** Отношение высоты инлайнового бокса шрифта к кеглю.
 *
 * `Range.getClientRects()` отдаёт инлайновый бокс строки: его высота — сумма
 * подъёма и спуска шрифта, а не заданная `line-height`. У системного шрифта она
 * больше кегля примерно на треть. Если кегль равен высоте зоны текста, бокс
 * выступает над ней, и рамка выделения уезжает вверх относительно видимого
 * слова. Множитель измеряется один раз для шрифта слоя.
 */
let contentRatio: number | null = null;

/** Замер отношения высоты инлайнового бокса шрифта к кеглю. */
function fontContentRatio(): number {
  if (contentRatio !== null) {
    return contentRatio;
  }
  const probe = document.createElement('span');
  probe.textContent = 'Mgq';
  probe.style.position = 'absolute';
  probe.style.left = '-9999px';
  probe.style.top = '0';
  probe.style.fontSize = '100px';
  probe.style.lineHeight = 'normal';
  probe.style.whiteSpace = 'pre';
  document.body.append(probe);
  const height = probe.getBoundingClientRect().height;
  probe.remove();
  // Запасной множитель — типовая высота бокса системного шрифта.
  contentRatio = height > 0 ? height / 100 : 1.2;
  return contentRatio;
}

/** Построение слоя из зон в координатах CSS-пикселей страницы.
 *
 * `ratio` — плотность растра: координаты движка заданы в пикселях отрисовки,
 * поэтому делятся на неё. Пробел в конце зоны сохраняет границы слов при
 * выделении и копировании. Кегль подбирается так, чтобы инлайновый бокс строки
 * совпал с высотой зоны: тогда прямоугольник выделения ложится на видимое слово.
 */
export function buildTextLayer(
  json: string,
  ratio: number,
  page: { width: number; height: number },
): HTMLDivElement {
  const layer = document.createElement('div');
  layer.className = 'textLayer';
  layer.style.width = page.width + 'px';
  layer.style.height = page.height + 'px';
  const scale = ratio > 0 ? ratio : 1;
  const boxRatio = fontContentRatio();
  for (const zone of parseTextZones(json)) {
    const span = document.createElement('span');
    const height = zone.h / scale;
    span.textContent = zone.t + ' ';
    span.style.left = zone.x / scale + 'px';
    span.style.top = zone.y / scale + 'px';
    span.style.width = zone.w / scale + 'px';
    span.style.height = height + 'px';
    span.style.fontSize = Math.max(1, height / boxRatio) + 'px';
    span.style.lineHeight = height + 'px';
    layer.append(span);
  }
  return layer;
}

/**
 * Подгонка текста зон по ширине.
 *
 * DjVu хранит координаты зон (слов), но шрифт браузера набирает то же слово с
 * другими метриками. Слой растягивает текст каждой зоны по её ширине
 * (`scaleX`), поэтому невидимый текст и прямоугольники выделения совпадают с
 * видимым словом растра. Вызывается после вставки слоя в документ: до вставки
 * размеры текста не измеряются.
 */
export function fitTextLayer(layer: HTMLElement): void {
  const spans = Array.from(layer.querySelectorAll<HTMLElement>('span'));
  const targets = spans.map((span) => Number.parseFloat(span.style.width));
  // Первый проход: ширина по содержимому (одна перекомпоновка), затем замер.
  for (const span of spans) {
    span.style.width = 'auto';
  }
  const naturals = spans.map((span) => span.scrollWidth);
  for (let index = 0; index < spans.length; index += 1) {
    const target = targets[index];
    const natural = naturals[index];
    if (!(target > 0) || !(natural > 0)) {
      spans[index].style.width = (target > 0 ? target : natural) + 'px';
      continue;
    }
    spans[index].style.width = natural + 'px';
    spans[index].style.transform = `scaleX(${target / natural})`;
  }
}

/**
 * Выравнивание прямоугольников выделения по растру страницы.
 *
 * Движок отдаёт координаты текстовых зон отдельно от растра, и при отрисовке
 * не в родном разрешении файла зона и её чернила расходятся: у наклонного текста
 * — до половины строки, а высота зоны бывает вдвое больше букв. Поэтому строки
 * берутся по полосам чернил самого растра, слово привязывается к строке по
 * наибольшему перекрытию своей зоны, а вертикаль и высота ставятся по найденной
 * строке. Горизонталь — по чернилам слова в пределах этой строки. Иначе рамка
 * выделения идёт не по видимому тексту, а по неточным зонам движка.
 *
 * `dark` переключает признак чернил: на перекрашенной под тему странице текст
 * светлый, а бумага тёмная.
 *
 * Возвращает число выровненных зон; `0` означает, что чернил не нашлось и
 * ничего не изменено.
 */
export function alignTextLayerToRaster(
  layer: HTMLElement,
  canvas: HTMLCanvasElement,
  dark = false,
): number {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= 0 || height <= 0) {
    return 0;
  }
  const canvasRect = canvas.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();
  const ratio = canvasRect.width > 0 ? width / canvasRect.width : 1;
  if (!(ratio > 0) || layerRect.width <= 0) {
    return 0;
  }
  let context: CanvasRenderingContext2D | null;
  try {
    context = canvas.getContext('2d');
  } catch {
    return 0;
  }
  if (!context) {
    return 0;
  }
  let pixels: Uint8ClampedArray;
  try {
    pixels = context.getImageData(0, 0, width, height).data;
  } catch {
    // Песочница запретила чтение пикселей — выравнивание невозможно.
    return 0;
  }
  const isInk = (x: number, y: number): boolean => {
    const index = (y * width + x) * 4;
    if (pixels[index + 3] < 128) {
      return false;
    }
    const luminance = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3;
    return dark ? luminance > 150 : luminance < 100;
  };
  const spans = Array.from(layer.querySelectorAll<HTMLElement>('span'))
    .map((span) => ({ span, rect: span.getBoundingClientRect() }))
    .filter((item) => item.rect.width >= 2 && item.rect.height >= 2);
  if (spans.length === 0) {
    return 0;
  }
  const boxRatio = fontContentRatio();
  const measured: Array<{
    span: HTMLElement;
    left: number;
    top: number;
    width: number;
    height: number;
  }> = [];
  // Полосы строк растра: проекция чернил по столбцам слов. Полоса строки — то,
  // что видно на странице, и она задаёт вертикаль рамки.
  const columnMask = new Uint8Array(width);
  for (const item of spans) {
    const x0 = Math.max(0, Math.floor((item.rect.left - canvasRect.left) * ratio));
    const x1 = Math.min(width - 1, Math.ceil((item.rect.right - canvasRect.left) * ratio));
    for (let x = x0; x <= x1; x += 1) {
      columnMask[x] = 1;
    }
  }
  const counts = new Int32Array(height);
  let peak = 0;
  for (let y = 0; y < height; y += 1) {
    let ink = 0;
    for (let x = 0; x < width; x += 1) {
      if (columnMask[x] === 1 && isInk(x, y)) {
        ink += 1;
      }
    }
    counts[y] = ink;
    if (ink > peak) {
      peak = ink;
    }
  }
  if (peak === 0) {
    return 0;
  }
  const floor = Math.max(1, Math.round(peak * 0.12));
  const rawRows: Array<{ top: number; bottom: number }> = [];
  let start = -1;
  for (let y = 0; y <= height; y += 1) {
    const on = y < height && counts[y] >= floor;
    if (on) {
      if (start < 0) {
        start = y;
      }
    } else if (start >= 0) {
      rawRows.push({ top: start, bottom: y - 1 });
      start = -1;
    }
  }
  // Осколок (линия, обрезанная краем строка) — не строка текста.
  const rawHeights = rawRows.map((row) => row.bottom - row.top + 1).sort((a, b) => a - b);
  const medianHeight = rawHeights[Math.floor(rawHeights.length / 2)] || 1;
  const rows = rawRows.filter((row) => row.bottom - row.top + 1 >= medianHeight * 0.5);
  if (rows.length === 0) {
    return 0;
  }
  const rowCenters = rows.map((row) => (row.top + row.bottom + 1) / 2);
  const steps: number[] = [];
  for (let index = 1; index < rowCenters.length; index += 1) {
    steps.push(rowCenters[index] - rowCenters[index - 1]);
  }
  steps.sort((a, b) => a - b);
  const pitch = steps.length > 0 ? steps[Math.floor(steps.length / 2)] : medianHeight;
  // Смещение зон от строк: зона движка при пересчёте dpi уезжает от букв на одну
  // и ту же долю строки для всей страницы. Величина берётся как МЕДИАНА по
  // словам — она устойчива к промахам отдельных слов, поэтому ни одно слово не
  // уводит сдвиг на соседнюю строку.
  const centers: number[] = [];
  for (const item of spans) {
    const zoneCenter = (item.rect.top + item.rect.height / 2 - canvasRect.top) * ratio;
    let nearest = rowCenters[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const center of rowCenters) {
      const distance = Math.abs(center - zoneCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = center;
      }
    }
    centers.push(nearest - zoneCenter);
  }
  centers.sort((a, b) => a - b);
  const shift = centers.length > 0 ? centers[Math.floor(centers.length / 2)] : 0;
  // Сдвиг применяется целиком, но не больше половины шага: медиана уже устойчива
  // к промахам отдельных слов, а ограничение страхует от вырожденного случая,
  // когда строк почти нет и медиана случайна. Слово не может уехать на соседнюю
  // строку: сдвиг один на всю страницу.
  const boundedShift = Math.max(-pitch * 0.5, Math.min(pitch * 0.5, shift));
  for (const item of spans) {
    const rect = item.rect;
    // Середина слова привязывается к центру ближайшей полосы растра: центр зоны,
    // сдвинутый общим сдвигом страницы, и есть центр строки букв. Высота берётся
    // у самой полосы, поэтому рамка совпадает с буквами по вертикали.
    const zoneCenter = (rect.top + rect.height / 2 - canvasRect.top) * ratio + boundedShift;
    let nearest: { top: number; bottom: number } | null = null;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const row of rows) {
      const distance = Math.abs((row.top + row.bottom + 1) / 2 - zoneCenter);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = row;
      }
    }
    let top = rect.top - canvasRect.top;
    let bottom = rect.bottom - canvasRect.top;
    if (nearest && nearestDistance <= pitch) {
      top = nearest.top / ratio;
      bottom = (nearest.bottom + 1) / ratio;
    }
    const y0 = Math.max(0, Math.floor(top * ratio));
    const y1 = Math.min(height - 1, Math.ceil(bottom * ratio));
    if (y1 <= y0) {
      continue;
    }
    // Горизонталь — по чернилам полосы своей строки.
    const zoneLeft = Math.floor((rect.left - canvasRect.left) * ratio);
    const zoneRight = Math.ceil((rect.right - canvasRect.left) * ratio);
    const slack = Math.max(1, Math.round((zoneRight - zoneLeft) * 0.04));
    const x0 = Math.max(0, zoneLeft - slack);
    const x1 = Math.min(width - 1, zoneRight + slack);
    let left = -1;
    let right = -1;
    if (zoneLeft >= 0 && zoneRight <= width - 1) {
      for (let x = x0; x <= x1; x += 1) {
        let hasInk = false;
        for (let y = y0; y <= y1; y += 1) {
          if (isInk(x, y)) {
            hasInk = true;
            break;
          }
        }
        if (hasInk) {
          if (left < 0) {
            left = x;
          }
          right = x;
        }
      }
    }
    measured.push({
      span: item.span,
      left:
        left >= 0 && right - left >= 1
          ? canvasRect.left - layerRect.left + left / ratio
          : rect.left - layerRect.left,
      top: rect.top - layerRect.top + top - (rect.top - canvasRect.top),
      width:
        left >= 0 && right - left >= 1
          ? (right - left + 1) / ratio
          : rect.width,
      height: bottom - top,
    });
  }
  if (measured.length === 0) {
    return 0;
  }
  for (const item of measured) {
    item.span.style.transform = 'none';
    item.span.style.width = 'auto';
    item.span.style.left = item.left + 'px';
    item.span.style.top = item.top + 'px';
    item.span.style.height = item.height + 'px';
    item.span.style.fontSize = Math.max(1, item.height / boxRatio) + 'px';
    item.span.style.lineHeight = item.height + 'px';
  }
  const naturals = measured.map((item) => item.span.scrollWidth);
  for (let index = 0; index < measured.length; index += 1) {
    const item = measured[index];
    const natural = naturals[index];
    if (natural > 0 && item.width > 0) {
      item.span.style.width = natural + 'px';
      item.span.style.transform = `scaleX(${item.width / natural})`;
    }
  }
  return measured.length;
}
