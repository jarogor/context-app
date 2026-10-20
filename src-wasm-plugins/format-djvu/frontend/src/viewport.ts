/** Геометрия масштаба и окна канваса страницы (чистые вычисления).
 *
 * Модуль не трогает DOM: принимает числа и возвращает числа и прямоугольники.
 * Плотность экрана передаётся явно, чтобы вычисления можно было проверить.
 */

/** Запас вокруг видимой области страницы для канваса, CSS px. */
export const WINDOW_MARGIN = 192;
/** Минимальная длина стороны канваса, CSS px. */
export const MIN_WINDOW_SIDE = 128;
/** Предельный размер стороны канваса, CSS px.
 *
 * Больше — браузер оставляет канвас белым; ограничение не даёт окну выродиться
 * на гигантском мониторе или при большом `devicePixelRatio`. */
export const MAX_CANVAS_SIDE = 8192;
/** Предельная площадь канваса (пиксели).
 *
 * Ограничение — по памяти и времени отрисовки. Оно должно быть с запасом выше
 * обычной страницы скана: растр страницы нужен не только для показа, но и для
 * выравнивания текстового слоя по буквам, а страница, нарисованная окном, этого
 * не даёт — слова вне окна остаются на неточных зонах движка. */
export const MAX_CANVAS_AREA = 32 * 1024 * 1024;
/** Верхний предел плотности растра. */
export const MAX_CANVAS_RATIO = 2;
/** Запас плотности растра над CSS-пикселями. */
export const RASTER_QUALITY = 1;

/** Прямоугольник с левым верхом (в любых пикселях). */
export interface AnchorRect {
  /** Координата левого края. */
  left: number;
  /** Координата верхнего края. */
  top: number;
}

/** Размер страницы или области, CSS px. */
export interface Size {
  /** Ширина. */
  width: number;
  /** Высота. */
  height: number;
}

/** Окно отрисовки канваса в CSS-пикселях относительно страницы. */
export interface WindowBox {
  /** Смещение по X от левого края страницы. */
  x0: number;
  /** Смещение по Y от верхнего края страницы. */
  y0: number;
  /** Ширина окна. */
  width: number;
  /** Высота окна. */
  height: number;
}

/** Действующая плотность растра по плотности экрана. */
export function displayRatio(devicePixelRatio: number): number {
  return Math.min(devicePixelRatio || 1, MAX_CANVAS_RATIO);
}

/**
 * Плотность растра канваса: не выше разумного предела и не выше предела размера
 * и площади канваса (иначе браузер оставит его белым).
 */
export function boundedRatio(width: number, height: number, devicePixelRatio: number): number {
  let ratio = displayRatio(devicePixelRatio) * RASTER_QUALITY;
  if (width > 0 && width * ratio > MAX_CANVAS_SIDE) {
    ratio = MAX_CANVAS_SIDE / width;
  }
  if (height > 0 && height * ratio > MAX_CANVAS_SIDE) {
    ratio = MAX_CANVAS_SIDE / height;
  }
  const area = width * height;
  if (area > 0 && area * ratio * ratio > MAX_CANVAS_AREA) {
    ratio = Math.sqrt(MAX_CANVAS_AREA / area);
  }
  return Math.max(0.25, ratio);
}

/**
 * Привязка координаты к пиксельной сетке устройства.
 *
 * Канвас, чей размер или положение в устройстве дробные, браузер пересэмплирует
 * при выводе — текст мутнеет. Округление до целого физического пикселя убирает
 * пересэмплирование: растр выводится 1:1.
 */
export function snapToDevice(value: number, ratio: number): number {
  return Math.round(value * ratio) / ratio;
}

/** Плотность, при которой вся страница помещается в пределы канваса.
 *
 * Страница рисуется целиком всегда, когда это возможно: растр нужен не только
 * для показа, но и для выравнивания текстового слоя. Если растр покрывает лишь
 * окно видимой области, слова за его пределами остаются на неточных зонах
 * движка — и выделение там расходится с буквами. Поэтому при большой странице
 * плотность понижается до предела площади, а не обрезается окно.
 */
export function pageRatio(width: number, height: number, devicePixelRatio: number): number {
  let ratio = displayRatio(devicePixelRatio);
  if (width > 0 && height > 0) {
    const areaLimit = Math.sqrt(MAX_CANVAS_AREA / (width * height));
    ratio = Math.min(ratio, areaLimit);
    ratio = Math.min(ratio, MAX_CANVAS_SIDE / width, MAX_CANVAS_SIDE / height);
  }
  return Math.max(0.25, ratio);
}

/** Признак, что вся страница помещается в пределы канваса при плотности. */
export function fitsWholePage(viewport: Size, ratio: number): boolean {
  return (
    viewport.width * ratio <= MAX_CANVAS_SIDE &&
    viewport.height * ratio <= MAX_CANVAS_SIDE &&
    viewport.width * viewport.height * ratio * ratio <= MAX_CANVAS_AREA
  );
}

/**
 * Желаемое окно страницы в CSS-пикселях (координаты относительно страницы).
 *
 * Если растр всей страницы помещается в пределы канваса, рисуется вся страница:
 * тогда прокрутка внутри неё ничего не перерисовывает, и текст не пропадает на
 * время отрисовки. Окно видимой области с запасом применяется только к
 * страницам, которые целиком не помещаются (сильное увеличение) — там память
 * ограничивается видимой областью.
 */
export function desiredWindow(
  rect: AnchorRect,
  viewerRect: AnchorRect,
  viewerClient: Size,
  viewport: Size,
  devicePixelRatio: number,
): WindowBox {
  const ratio = displayRatio(devicePixelRatio);
  if (fitsWholePage(viewport, ratio)) {
    return { x0: 0, y0: 0, width: viewport.width, height: viewport.height };
  }
  const x0 = Math.max(0, viewerRect.left - rect.left - WINDOW_MARGIN);
  const y0 = Math.max(0, viewerRect.top - rect.top - WINDOW_MARGIN);
  const x1 = Math.min(
    viewport.width,
    viewerRect.left + viewerClient.width - rect.left + WINDOW_MARGIN,
  );
  const y1 = Math.min(
    viewport.height,
    viewerRect.top + viewerClient.height - rect.top + WINDOW_MARGIN,
  );
  const width = Math.max(MIN_WINDOW_SIDE, x1 - x0);
  const height = Math.max(MIN_WINDOW_SIDE, y1 - y0);
  return {
    x0: Math.min(x0, Math.max(0, viewport.width - width)),
    y0: Math.min(y0, Math.max(0, viewport.height - height)),
    width: Math.min(width, viewport.width),
    height: Math.min(height, viewport.height),
  };
}
