/** Полосы строк по прямоугольникам диапазона.
 *
 * `Range.getClientRects()` отдаёт прямоугольники по инлайн-боксу шрифта слоя, а
 * не по межстрочному шагу. У встроенного шрифта цифровой страницы бокс чуть
 * ниже шага — между полосами появляются щели; у запасного `monospace` на сканах
 * бокс заметно выше шага — полосы залезают на соседние строки. Здесь куски
 * строк сливаются, а вертикаль приводится к межстрочному шагу страницы.
 */
import type { Rect } from './types';

/** Полосы одного диапазона: слитые по строкам и исходные куски. */
export interface LineTiles {
  /** По одному прямоугольнику на строку (для полос-меток и цитат). */
  merged: Rect[];
  /** Исходные куски с приведённой вертикалью (для заливки). */
  raw: Rect[];
}

/** Строка диапазона: вертикальные границы и горизонтальный охват. */
interface Line {
  /** Верхняя граница строки. */
  top: number;
  /** Нижняя граница строки. */
  bottom: number;
  /** Левая граница. */
  x: number;
  /** Правая граница. */
  right: number;
}

/**
 * Слияние прямоугольников в строки и приведение их к межстрочному шагу.
 *
 * Куски одной строки (несколько span'ов) сливаются по заметному вертикальному
 * перекрытию. Вертикаль полосы берётся по шагу строк **страницы** (`linePitch`),
 * а не по составу выделения: шаг, посчитанный по самому выделению, у одной
 * строки равен нулю, и полоса выходила высотой с буквы — а при протяжке вниз
 * шаг рос, и верхняя полоса перескакивала на полстроки. Шаг страницы при этом
 * не меняется: слой уже измерил его по всем строкам (см. `data-line-pitch`).
 *
 * Без шага (страница без слоя) полоса остаётся по высоте бокса.
 */
export function tileByLine(
  rects: Rect[] | null | undefined,
  linePitch = 0,
): LineTiles {
  const items = (rects || [])
    .filter((rect) => rect.width > 0 && rect.height > 0)
    .sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2) || a.x - b.x);
  const lines: Line[] = [];
  const lineOf: Line[] = [];
  for (const rect of items) {
    const line = lines[lines.length - 1];
    if (line) {
      const overlap =
        Math.min(line.bottom, rect.y + rect.height) - Math.max(line.top, rect.y);
      const minHeight = Math.min(line.bottom - line.top, rect.height);
      // Заметное вертикальное перекрытие — та же строка, сливаем её куски.
      if (overlap > minHeight * 0.5) {
        line.top = Math.min(line.top, rect.y);
        line.bottom = Math.max(line.bottom, rect.y + rect.height);
        line.x = Math.min(line.x, rect.x);
        line.right = Math.max(line.right, rect.x + rect.width);
        lineOf.push(line);
        continue;
      }
    }
    const created: Line = {
      top: rect.y,
      bottom: rect.y + rect.height,
      x: rect.x,
      right: rect.x + rect.width,
    };
    lines.push(created);
    lineOf.push(created);
  }
  const centers = lines.map((line) => (line.top + line.bottom) / 2);
  // Шаг строк: измеренный по странице, а без него — медиана расстояний между
  // серединами соседних полос.
  let pitch = linePitch > 0 ? linePitch : 0;
  if (!(pitch > 0)) {
    const steps: number[] = [];
    for (let index = 1; index < centers.length; index += 1) {
      steps.push(centers[index] - centers[index - 1]);
    }
    steps.sort((a, b) => a - b);
    pitch = steps.length > 0 ? steps[Math.floor(steps.length / 2)] : 0;
  }
  /* Полосы доводятся до высоты строки: у слоя скана бокс равен высоте букв, и
     без этого полоса шла бы только по буквам — у строк без выносных элементов
     она вдвое ниже, а у первой и последней обрезана. Центр строки сохраняется,
     вертикаль берётся по межстрочному шагу, а граница с соседней строкой
     проходит посередине между их серединами — полосы стыкуются без наложений. */
  const tops = lines.map((line) => line.top);
  const bottoms = lines.map((line) => line.bottom);
  /* Сосед берётся по месту, а не по порядку в списке. В OCR-страницах строки
     двух колонок чередуются по вертикали, и «предыдущая в списке» может
     оказаться из другой колонки на той же высоте: полоса тогда обрезалась
     серединой чужой строки и подсвечивала не ту строку. */
  const neighbour = (index: number, direction: -1 | 1): number | null => {
    const own = centers[index];
    const ownLeft = lines[index].x;
    const ownRight = lines[index].right;
    let best: number | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let other = 0; other < lines.length; other += 1) {
      if (other === index) {
        continue;
      }
      const distance = (centers[other] - own) * direction;
      if (!(distance > 0) || distance >= pitch * 1.5) {
        continue;
      }
      // Соседняя строка — та же колонка: строки разных колонок стоят рядом по
      // вертикали, но текстом не соседствуют.
      const overlap =
        Math.min(ownRight, lines[other].right) - Math.max(ownLeft, lines[other].x);
      if (overlap <= 0) {
        continue;
      }
      if (distance < bestDistance) {
        bestDistance = distance;
        best = other;
      }
    }
    return best;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const center = centers[index];
    // Шаг страницы больше бокса: полоса растягивается до строки. Меньше — это
    // не шаг строки, а плотный набор, где строки уже бокса; тогда высота берётся
    // по боксу, иначе полосы начали бы терять буквы.
    const box = lines[index].bottom - lines[index].top;
    const half = pitch > box ? pitch / 2 : box / 2;
    let top = center - half;
    let bottom = center + half;
    const above = neighbour(index, -1);
    if (above !== null) {
      top = Math.max(top, (centers[above] + center) / 2);
    }
    const below = neighbour(index, 1);
    if (below !== null) {
      bottom = Math.min(bottom, (center + centers[below]) / 2);
    }
    tops[index] = top;
    bottoms[index] = bottom;
  }
  const merged: Rect[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const width = line.right - line.x;
    if (width > 0 && bottoms[index] > tops[index]) {
      merged.push({
        x: line.x,
        y: tops[index],
        width,
        height: bottoms[index] - tops[index],
      });
    }
  }
  const raw: Rect[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const rect = items[index];
    const lineIndex = lines.indexOf(lineOf[index]);
    if (rect.width > 0 && bottoms[lineIndex] > tops[lineIndex]) {
      raw.push({
        x: rect.x,
        y: tops[lineIndex],
        width: rect.width,
        height: bottoms[lineIndex] - tops[lineIndex],
      });
    }
  }
  return { merged, raw };
}

/** Приведение прямоугольников цитаты к полосам строк без наложений. */
export function tileLineRects(
  rects: Rect[] | null | undefined,
  linePitch = 0,
): Rect[] {
  return tileByLine(rects, linePitch).merged;
}
