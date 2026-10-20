/** Полосы строк по прямоугольникам диапазона.
 *
 * `Range.getClientRects()` отдаёт прямоугольники по инлайн-боксу шрифта слоя, а
 * не по межстрочному шагу. У встроенного шрифта цифровой страницы бокс чуть
 * ниже шага — между полосами появляются щели; у запасного `monospace` на сканах
 * бокс заметно выше шага — полосы залезают на соседние строки. Здесь куски
 * строк сливаются, а вертикаль приводится к межстрочному шагу.
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
 * перекрытию. У строк одного блока (абзаца) базовые линии отстоят ровно на шаг,
 * поэтому соседние полосы внутри блока тайлятся по серединам: их общая граница
 * проходит посередине между серединами строк, и полосы стыкуются встык при
 * любой высоте бокса. Разрыв больше шага (отступ между абзацами) границей не
 * перекрывается — промежуток сохраняется.
 */
export function tileByLine(rects: Rect[] | null | undefined): LineTiles {
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
  // Пары соседних полос стыкуются, только когда строки стоят «вплотную»:
  // инлайн-боксы перекрываются или разрыв между ними не больше высоты бокса.
  const joined = new Array<boolean>(Math.max(lines.length - 1, 0)).fill(false);
  for (let index = 1; index < lines.length; index += 1) {
    const previousBox = lines[index - 1].bottom - lines[index - 1].top;
    const box = lines[index].bottom - lines[index].top;
    const gap = lines[index].top - lines[index - 1].bottom;
    joined[index - 1] = gap <= Math.min(previousBox, box);
  }
  const tops = lines.map((line) => line.top);
  const bottoms = lines.map((line) => line.bottom);
  for (let index = 0; index < lines.length; index += 1) {
    const center = centers[index];
    if (index > 0 && joined[index - 1]) {
      // Общая граница со строкой сверху — посередине между серединами.
      tops[index] = (centers[index - 1] + center) / 2;
    } else if (index < lines.length - 1 && joined[index]) {
      // Верхний край крайней строки обрезается на полшага от соседа снизу: у
      // скана инлайн-бокс выше шага, и без обрезки полоса «торчит» вверх.
      tops[index] = Math.max(center - (centers[index + 1] - center) / 2, lines[index].top);
    }
    if (index < lines.length - 1 && joined[index]) {
      bottoms[index] = (center + centers[index + 1]) / 2;
    } else if (index > 0 && joined[index - 1]) {
      bottoms[index] = Math.min(center + (center - centers[index - 1]) / 2, lines[index].bottom);
    }
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
export function tileLineRects(rects: Rect[] | null | undefined): Rect[] {
  return tileByLine(rects).merged;
}
