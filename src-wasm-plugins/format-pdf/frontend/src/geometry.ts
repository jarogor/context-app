/** Геометрия заметок: разбор фигур, построение их SVG-элементов и мишеней.
 *
 * Модуль чист от состояния: принимает геометрию в долях страницы и строит
 * элементы, не завися от страниц и заметок.
 */
import type { ShapeGeometry, ShapeKind } from './types';

/** Разбор геометрии фигуры: две точки в долях страницы. */
export function parseGeometry(value: string | null | undefined): ShapeGeometry | null {
  let geometry: unknown;
  try {
    geometry = JSON.parse(value || '');
  } catch (error) {
    return null;
  }
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }
  const candidate = geometry as Record<string, unknown>;
  const coordinates = [candidate.x1, candidate.y1, candidate.x2, candidate.y2];
  if (!coordinates.every((number) => typeof number === 'number' && isFinite(number))) {
    return null;
  }
  return {
    x1: candidate.x1 as number,
    y1: candidate.y1 as number,
    x2: candidate.x2 as number,
    y2: candidate.y2 as number,
  };
}

/** Пространство имён SVG. */
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

/** Создание SVG-элемента фигуры по её виду и геометрии. */
export function shapeElement(shape: ShapeKind, geometry: ShapeGeometry): SVGElement {
  const { x1, y1, x2, y2 } = geometry;
  if (shape === 'rectangle') {
    const rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    rect.setAttribute('x', String(Math.min(x1, x2)));
    rect.setAttribute('y', String(Math.min(y1, y2)));
    rect.setAttribute('width', String(Math.abs(x2 - x1)));
    rect.setAttribute('height', String(Math.abs(y2 - y1)));
    return rect;
  }
  if (shape === 'ellipse') {
    const ellipse = document.createElementNS(SVG_NAMESPACE, 'ellipse');
    ellipse.setAttribute('cx', String((x1 + x2) / 2));
    ellipse.setAttribute('cy', String((y1 + y2) / 2));
    ellipse.setAttribute('rx', String(Math.abs(x2 - x1) / 2));
    ellipse.setAttribute('ry', String(Math.abs(y2 - y1) / 2));
    return ellipse;
  }
  const line = document.createElementNS(SVG_NAMESPACE, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  return line;
}

/** Описание контура фигуры для прозрачной мишени клика. */
export function shapeHitPath(shape: ShapeKind, geometry: ShapeGeometry): string {
  const { x1, y1, x2, y2 } = geometry;
  if (shape === 'rectangle') {
    const left = Math.min(x1, x2);
    const top = Math.min(y1, y2);
    const right = Math.max(x1, x2);
    const bottom = Math.max(y1, y2);
    return `M${left} ${top}H${right}V${bottom}H${left}Z`;
  }
  if (shape === 'ellipse') {
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const rx = Math.abs(x2 - x1) / 2;
    const ry = Math.abs(y2 - y1) / 2;
    return (
      `M${cx - rx} ${cy}` +
      `A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}` +
      `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`
    );
  }
  return `M${x1} ${y1}L${x2} ${y2}`;
}

/**
 * Создание прозрачной широкой мишени по контуру фигуры (`<path>`).
 *
 * Тонкая видимая линия почти не кликается, поэтому рядом с фигурой кладётся
 * прозрачная обводка по тому же контуру. Тип `path` выбран, чтобы не добавлять
 * в разметку вторые `line`/`rect`/`ellipse` и не ломать подсчёты.
 */
export function shapeHitElement(shape: ShapeKind, geometry: ShapeGeometry): SVGElement {
  const path = document.createElementNS(SVG_NAMESPACE, 'path');
  path.setAttribute('d', shapeHitPath(shape, geometry));
  return path;
}

/** Смещение точки внутри страницы на указанный сдвиг с зажимом в долях. */
export function shiftGeometry(
  geometry: ShapeGeometry,
  dx: number,
  dy: number,
): ShapeGeometry {
  const clamp = (value: number): number => Math.max(0, Math.min(1, value));
  return {
    x1: clamp(geometry.x1 + dx),
    y1: clamp(geometry.y1 + dy),
    x2: clamp(geometry.x2 + dx),
    y2: clamp(geometry.y2 + dy),
  };
}
