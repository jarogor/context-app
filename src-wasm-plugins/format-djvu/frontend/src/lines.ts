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
  // Шаг строк: медиана расстояний между серединами соседних полос. Медиана
  // устойчива к случайному пропуску строки и к абзацному отступу.
  const steps: number[] = [];
  for (let index = 1; index < centers.length; index += 1) {
    steps.push(centers[index] - centers[index - 1]);
  }
  steps.sort((a, b) => a - b);
  const pitch = steps.length > 0 ? steps[Math.floor(steps.length / 2)] : 0;
  // Строки одного абзаца стоят на ровном шаге. Признак «вплотную» берётся от
  // шага и от промежутка между боксами: у слоя скана бокс равен высоте букв, и
  // промежуток между строками больше бокса — по одному боксу строки абзаца
  // никогда не считались бы соседними, и полосы шли бы с щелями. Абзацный отступ
  // оставляет промежуток в разы больше бокса — там полосы не стыкуются.
  const joined = new Array<boolean>(Math.max(lines.length - 1, 0)).fill(false);
  for (let index = 1; index < lines.length; index += 1) {
    const distance = centers[index] - centers[index - 1];
    const gap = lines[index].top - lines[index - 1].bottom;
    const box = Math.min(
      lines[index - 1].bottom - lines[index - 1].top,
      lines[index].bottom - lines[index].top,
    );
    joined[index - 1] =
      pitch > 0 && distance > 0 && distance <= pitch * 1.35 && gap <= box * 1.8;
  }
  const tops = lines.map((line) => line.top);
  const bottoms = lines.map((line) => line.bottom);
  for (let index = 0; index < lines.length; index += 1) {
    const center = centers[index];
    // Внутри абзаца полоса тянется до середины промежутка с соседней строкой:
    // полосы стыкуются встык, и блок текста выглядит единой фигурой, как в PDF.
    if (index > 0 && joined[index - 1]) {
      tops[index] = (centers[index - 1] + center) / 2;
    } else {
      // Крайняя строка выделения или строка после абзацного отступа: растягивать
      // её в промежуток некуда — иначе полоса выходит за буквы и цепляет чужой
      // абзац. Край остаётся по фактической границе строки.
      tops[index] = lines[index].top;
    }
    if (index < lines.length - 1 && joined[index]) {
      bottoms[index] = (center + centers[index + 1]) / 2;
    } else {
      bottoms[index] = lines[index].bottom;
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
