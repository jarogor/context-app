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

/** Построение слоя из зон в координатах CSS-пикселей страницы.
 *
 * `ratio` — плотность растра: координаты движка заданы в пикселях отрисовки,
 * поэтому делятся на неё. Пробел в конце зоны сохраняет границы слов при
 * выделении и копировании.
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
  for (const zone of parseTextZones(json)) {
    const span = document.createElement('span');
    const height = zone.h / scale;
    span.textContent = zone.t + ' ';
    span.style.left = zone.x / scale + 'px';
    span.style.top = zone.y / scale + 'px';
    span.style.width = zone.w / scale + 'px';
    span.style.height = height + 'px';
    span.style.fontSize = Math.max(1, height * 0.9) + 'px';
    span.style.lineHeight = height + 'px';
    layer.append(span);
  }
  return layer;
}
