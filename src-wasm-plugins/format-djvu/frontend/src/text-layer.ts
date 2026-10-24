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
    // Масштаб — от ЛЕВОГО края: при центровом `transform-origin` (по умолчанию)
    // слово сжимается симметрично, и рамка уезжает влево — конец слова
    // оказывается недовыделенным на полбуквы, а начало заходит на предыдущее
    // слово. Левый край слова остаётся на месте, правый ставится по ширине.
    spans[index].style.transformOrigin = '0 0';
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
    context = canvas.getContext('2d', { willReadFrequently: true });
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
  // Полосы строк растра: проекция чернил по столбцам слов. Полоса строки — то,
  // что видно на странице, и она задаёт вертикаль рамки.
  //
  // Проход идёт по пикселям столбцов слов, а не по всей странице: раньше на
  // каждую строку проверялась вся ширина, и выравнивание стоило около двух
  // секунд на страницу. Набор столбцов тот же — за пределами слов чернила в
  // проекцию не входят.
  const columns: number[] = [];
  const seenColumn = new Uint8Array(width);
  for (const item of spans) {
    const x0 = Math.max(0, Math.floor((item.rect.left - canvasRect.left) * ratio));
    const x1 = Math.min(width - 1, Math.ceil((item.rect.right - canvasRect.left) * ratio));
    for (let x = x0; x <= x1; x += 1) {
      if (seenColumn[x] === 0) {
        seenColumn[x] = 1;
        columns.push(x);
      }
    }
  }
  columns.sort((a, b) => a - b);
  const counts = new Int32Array(height);
  let peak = 0;
  for (const x of columns) {
    for (let y = 0; y < height; y += 1) {
      if (isInk(x, y)) {
        counts[y] += 1;
      }
    }
  }
  for (let y = 0; y < height; y += 1) {
    if (counts[y] > peak) {
      peak = counts[y];
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
  // Слово привязывается к строке растра: центр зоны со сдвигом страницы — центр
  // строки букв. Высота берётся у самой полосы, поэтому рамка совпадает с
  // буквами по вертикали.
  interface PlacedWord {
    /** Невидимый `span` слова. */
    span: HTMLElement;
    /** Прямоугольник слова до выравнивания. */
    rect: DOMRect;
    /** Номер полосы строки растра; -1 — строка не найдена. */
    row: number;
    /** Верх рамки в CSS-пикселях страницы. */
    top: number;
    /** Низ рамки в CSS-пикселях страницы. */
    bottom: number;
    /** Левый край зоны в пикселях растра. */
    zoneLeft: number;
    /** Правый край зоны в пикселях растра. */
    zoneRight: number;
  }
  const placed: PlacedWord[] = [];
  for (const item of spans) {
    const rect = item.rect;
    const zoneCenter = (rect.top + rect.height / 2 - canvasRect.top) * ratio + boundedShift;
    // Строка ищется по ЧЕРНИЛАМ В СТОЛБЦАХ САМОГО СЛОВА, а не по всей странице.
    // Полоса, найденная по всей ширине, расширяется выносными элементами
    // соседних строк (курсив, «р», «у», «д»), и её центр уходит на полстроки —
    // рамка съезжает на соседнюю строку. В столбцах своего слова буквы — только
    // его строки.
    let row = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    if (rows.length > 0) {
      // Кандидаты — строки в окне вокруг центра зоны. Профиль считается только
      // в этом окне: проход по всей высоте страницы для каждого слова стоил
      // секунды на страницу.
      const candidates: number[] = [];
      let windowTop = Number.POSITIVE_INFINITY;
      let windowBottom = Number.NEGATIVE_INFINITY;
      for (let index = 0; index < rows.length; index += 1) {
        const rowCenter = (rows[index].top + rows[index].bottom + 1) / 2;
        const distance = Math.abs(rowCenter - zoneCenter);
        if (distance > pitch * 1.5) {
          continue;
        }
        candidates.push(index);
        windowTop = Math.min(windowTop, rows[index].top);
        windowBottom = Math.max(windowBottom, rows[index].bottom);
      }
      if (candidates.length > 0) {
        const x0 = Math.max(0, Math.floor((rect.left - canvasRect.left) * ratio));
        const x1 = Math.min(width - 1, Math.ceil((rect.right - canvasRect.left) * ratio));
        const from = Math.max(0, Math.floor(windowTop));
        const to = Math.min(height - 1, Math.ceil(windowBottom));
        // Вертикальный профиль чернил в столбцах слова.
        const own = new Int32Array(Math.max(1, to - from + 1));
        for (let x = x0; x <= x1; x += 1) {
          for (let y = from; y <= to; y += 1) {
            if (isInk(x, y)) {
              own[y - from] += 1;
            }
          }
        }
        let ownPeak = 0;
        for (let index = 0; index < own.length; index += 1) {
          if (own[index] > ownPeak) {
            ownPeak = own[index];
          }
        }
        for (const index of candidates) {
          const distance = Math.abs((rows[index].top + rows[index].bottom + 1) / 2 - zoneCenter);
          // Строка-кандидат должна иметь чернила в столбцах слова: иначе это
          // строка соседнего абзаца или колонтитул, и слово к ней не относится.
          let ink = 0;
          if (ownPeak > 0) {
            const lineFrom = Math.max(from, rows[index].top);
            const lineTo = Math.min(to, rows[index].bottom);
            for (let y = lineFrom; y <= lineTo; y += 1) {
              ink += own[y - from];
            }
          }
          if (ownPeak > 0 && ink < ownPeak * 0.15) {
            continue;
          }
          if (distance < nearestDistance) {
            nearestDistance = distance;
            row = index;
          }
        }
      }
    }
    let top = rect.top - canvasRect.top;
    let bottom = rect.bottom - canvasRect.top;
    if (row >= 0 && nearestDistance <= pitch) {
      top = rows[row].top / ratio;
      bottom = (rows[row].bottom + 1) / ratio;
    } else {
      row = -1;
    }
    placed.push({
      span: item.span,
      rect,
      row,
      top,
      bottom,
      zoneLeft: (rect.left - canvasRect.left) * ratio,
      zoneRight: (rect.right - canvasRect.left) * ratio,
    });
  }
  // Слова строки упорядочиваются по левому краю зоны. Правый край слова берётся
  // от ЛЕВОГО КРАЯ ЗОНЫ СЛЕДУЮЩЕГО СЛОВА, а не от порога просвета: у плотного
  // шрифта просвет внутри слова (13 px) почти равен межсловному (16), и любой
  // порог либо рвёт слово на буквах, либо склеивает соседние слова. Зоны задают
  // порядок слов, поэтому граница между словами известна точно, и рамка равна
  // видимому слову при любом масштабе.
  const rowWords = new Map<number, PlacedWord[]>();
  for (const word of placed) {
    if (word.row < 0) {
      continue;
    }
    const bucket = rowWords.get(word.row) ?? [];
    bucket.push(word);
    rowWords.set(word.row, bucket);
  }
  for (const bucket of rowWords.values()) {
    bucket.sort((first, second) => first.zoneLeft - second.zoneLeft);
  }
  // Горизонталь — по разрывам чернил полосы, а не по краям зон. Зона OCR сдвинута
  // от букв: её левый край заходит на предыдущее слово, правый не доходит до
  // конца своего — поэтому рамка выходила короче слова на полбуквы и заезжала на
  // соседа. Полоса строки режется на столько частей, сколько в ней слов по зонам,
  // и границами служат самые широкие разрывы чернил. Внутри слова разрыв между
  // буквами уже межсловного, а выбор по числу слов не зависит от порога: он
  // одинаково верен для плотного и разреженного шрифта и при любом масштабе.
  const segments = new Map<PlacedWord, { left: number; right: number }>();
  for (const bucket of rowWords.values()) {
    const sample = bucket[0];
    const y0 = Math.max(0, Math.floor(sample.top * ratio));
    const y1 = Math.min(height - 1, Math.ceil(sample.bottom * ratio));
    if (y1 <= y0) {
      continue;
    }
    // Высота полосы строки: от неё считаются запас поиска и пороги.
    const lineHeightPx = y1 - y0 + 1;
    // Чернильные столбцы полосы строки — от первого до последнего столбца её
    // слов с запасом. Зона бывает уже букв (и на крупном масштабе расходятся
    // сильнее), поэтому запас берётся с избытком; за его пределами — поля
    // страницы. Проход идёт по непрерывному диапазону, а не по всей ширине: это
    // вдвое-втрое меньше работы на строку.
    const slack = Math.round(lineHeightPx * 4);
    let bandFrom = width - 1;
    let bandTo = 0;
    for (const word of bucket) {
      bandFrom = Math.min(bandFrom, Math.floor(word.zoneLeft));
      bandTo = Math.max(bandTo, Math.ceil(word.zoneRight));
    }
    const bandLeft = Math.max(0, bandFrom - slack);
    const bandRight = Math.min(width - 1, bandTo + slack);
    if (bandRight < bandLeft) {
      continue;
    }
    const columnInk = new Uint8Array(bandRight - bandLeft + 1);
    for (let x = bandLeft; x <= bandRight; x += 1) {
      for (let y = y0; y <= y1; y += 1) {
        if (isInk(x, y)) {
          columnInk[x - bandLeft] = 1;
          break;
        }
      }
    }
    // Непрерывные участки чернил и разрывы между ними.
    const runs: Array<{ left: number; right: number }> = [];
    let runStart = -1;
    for (let index = 0; index <= columnInk.length; index += 1) {
      const ink = index < columnInk.length && columnInk[index] === 1;
      if (ink && runStart < 0) {
        runStart = index;
      }
      if (!ink && runStart >= 0) {
        runs.push({ left: runStart + bandLeft, right: index - 1 + bandLeft });
        runStart = -1;
      }
    }
    if (runs.length === 0) {
      continue;
    }
    if (bucket.length === 1) {
      // Одна зона на полосе — слово, либо зона, растянутая на строку.
      const zone = bucket[0];
      const chars = Math.max(1, (zone.span.textContent ?? '').trim().length);
      // Растянутость определяется по числу символов: слово такой длины в разы
      // уже зоны, растянутой на строку. Порог от одной высоты строки не годится —
      // длинное слово тоже шире нескольких высот.
      const stretched = zone.zoneRight - zone.zoneLeft > chars * lineHeightPx * 0.8;
      let last = -1;
      if (stretched) {
        // Растянутая зона: берутся участки одного слова. Граница — разрыв, резко
        // больший остальных (между словами), а не порог в пикселях: у плотного
        // шрифта межбуквенный разрыв почти равен межсловному, и порог не
        // разделяет. Если все разрывы соразмерны, слово занимает всю полосу.
        const gaps: Array<{ index: number; length: number }> = [];
        for (let index = 1; index < runs.length; index += 1) {
          gaps.push({ index, length: runs[index].left - runs[index - 1].right - 1 });
        }
        const lengths = gaps.map((gap) => gap.length).sort((a, b) => a - b);
        let split = -1;
        for (let index = 1; index < lengths.length; index += 1) {
          // Скачок в 1.8 раза отличает межсловный разрыв от межбуквенного.
          if (lengths[index] >= lengths[index - 1] * 1.8) {
            const at = lengths[index];
            const gap = gaps.find((item) => item.length === at);
            split = gap ? gap.index : -1;
          }
        }
        last = split > 0 ? split - 1 : runs.length - 1;
      } else {
        // Обычная зона: участки, попавшие в её пределы. Внутри слова встречаются
        // разреженные буквы (курсив, разрядка), и брать одну группу значило бы
        // обрезать слово.
        last = -1;
        const margin = Math.max(2, Math.round(lineHeightPx * 0.5));
        for (let index = 0; index < runs.length; index += 1) {
          const run = runs[index];
          if (run.right < zone.zoneLeft - margin) {
            continue;
          }
          if (run.left > zone.zoneRight + margin) {
            break;
          }
          last = index;
        }
      }
      let first = -1;
      for (let index = 0; index <= last; index += 1) {
        if (runs[index].right >= zone.zoneLeft - lineHeightPx) {
          first = index;
          break;
        }
      }
      if (first >= 0 && last >= first) {
        segments.set(zone, { left: runs[first].left, right: runs[last].right });
      }
      continue;
    }
    // Границы слов ищутся ЛОКАЛЬНО: у каждой пары соседних зон известен
    // интервал между их серединами, и разрыв ищется только в нём. Глобальный
    // выбор «N самых широких разрывов» не годится: у плотного шрифта межсловный
    // разрыв бывает уже межбуквенного, и тогда границы уезжают на буквы внутри
    // слов — полоса режется, и рамка съезжает на соседа. Привязка к стыку зон
    // тоже не годится: стык смещён от букв, и это смещение растёт с масштабом
    // неравномерно — на 140 % настоящий разрыв между словами оставался за окном.
    /** Для слова `i`: участок чернил, с которого оно начинается. */
    const startsAt = new Array<number>(bucket.length).fill(-1);
    startsAt[0] = 0;
    // Курсор держит границы монотонными: слово не может начаться раньше
    // предыдущего. Без этого узкая зона получала пустой участок.
    let cursor = 0;
    for (let index = 1; index < bucket.length; index += 1) {
      const previous = bucket[index - 1];
      const current = bucket[index];
      const previousCenter = (previous.zoneLeft + previous.zoneRight) / 2;
      const currentCenter = (current.zoneLeft + current.zoneRight) / 2;
      // Окно поиска — между ЦЕНТРАМИ соседних зон: граница двух слов не может
      // лежать левее середины предыдущего или правее середины следующего. От
      // стыка зон окно брать нельзя: стык смещён от букв, и его смещение растёт
      // с масштабом неравномерно. На 140 % стык зон давал просвет 21 px, а
      // фактический просвет между буквами был 88 px — настоящий разрыв оставался
      // за окном, и рамка обрывалась на 44 px раньше конца слова.
      const low = previousCenter + 1;
      const high = currentCenter - 1;
      let best = -1;
      let bestWidth = -1;
      let nearest = -1;
      let nearestDistance = Number.POSITIVE_INFINITY;
      for (let run = cursor + 1; run < runs.length; run += 1) {
        const gapLeft = runs[run - 1].right;
        const gapRight = runs[run].left;
        // Участок уже за окном — дальше искать нечего.
        if (gapLeft > high) {
          break;
        }
        const middle = (gapLeft + gapRight) / 2;
        if (middle < low) {
          nearest = run;
          nearestDistance = low - middle;
          continue;
        }
        if (middle > high) {
          if (nearest < 0) {
            nearest = run;
            nearestDistance = middle - high;
          }
          break;
        }
        const width = gapRight - gapLeft - 1;
        if (width > bestWidth) {
          bestWidth = width;
          best = run;
        }
        if (nearestDistance > middle - low) {
          nearest = run;
          nearestDistance = middle - low;
        }
      }
      // Разрыв в окне не найден (буквы слиплись) — берётся ближайший к стыку:
      // рамка тогда граничит с соседом, а не тянется до конца строки.
      const chosen = best > 0 ? best : nearest > 0 ? nearest : cursor + 1;
      startsAt[index] = Math.min(Math.max(chosen, cursor + 1), Math.max(0, runs.length - 1));
      cursor = startsAt[index];
    }
    for (let index = 0; index < bucket.length; index += 1) {
      const from = startsAt[index];
      if (from < 0) {
        continue;
      }
      let to: number;
      if (index < bucket.length - 1) {
        to = startsAt[index + 1] - 1;
      } else {
        // У последнего слова справа границы от соседа нет: конец берётся по его
        // зоне с запасом в высоту строки. Иначе рамка тянулась бы до конца
        // полосы — на колонцифру или номер страницы.
        const extra = Math.max(4, Math.round(lineHeightPx * 1.5));
        to = from;
        for (let run = from; run < runs.length; run += 1) {
          if (runs[run].left > bucket[index].zoneRight + extra) {
            break;
          }
          to = run;
        }
      }
      if (to < from) {
        continue;
      }
      segments.set(bucket[index], {
        left: runs[from].left,
        right: runs[to].right,
      });
    }
  }
  const measured: Array<{
    span: HTMLElement;
    left: number;
    top: number;
    width: number;
    height: number;
  }> = [];
  for (const word of placed) {
    const segment = segments.get(word);
    const left = segment ? segment.left : -1;
    const right = segment ? segment.right : -1;
    measured.push({
      span: word.span,
      left:
        left >= 0 && right - left >= 1
          ? canvasRect.left - layerRect.left + left / ratio
          : word.rect.left - layerRect.left,
      top: word.rect.top - layerRect.top + word.top - (word.rect.top - canvasRect.top),
      width:
        left >= 0 && right - left >= 1
          ? (right - left + 1) / ratio
          : word.rect.width,
      height: word.bottom - word.top,
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
      // Масштаб от левого края — иначе рамка сжимается к середине слова и
      // теряет конец (см. `fitTextLayer`).
      item.span.style.transformOrigin = '0 0';
      item.span.style.transform = `scaleX(${item.width / natural})`;
    }
  }
  // Межстрочный шаг страницы в CSS-пикселях: по нему строится высота полосы
  // выделения. Без него одиночное слово выделялось бы по высоте букв, а блок —
  // по высоте строки, и выделение выглядело бы двумя разными.
  layer.dataset.linePitch = String(pitch / ratio);
  return measured.length;
}
