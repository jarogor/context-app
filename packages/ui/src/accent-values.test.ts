import { describe, expect, it } from 'vitest';

import {
  ACCENT_COLORS,
  ACCENT_FILL_COLORS,
  ACCENT_INK_COLORS,
  type AccentColor,
  type AccentStrength,
} from './accent';

/** Ступени силы цвета. */
const STRENGTHS: readonly AccentStrength[] = ['tint', 'soft', 'active'];

/** Канонический тон цвета: его держат все ступени. */
const HUE: Record<AccentColor, number> = {
  yellow: 88,
  green: 145,
  blue: 252,
  red: 25,
  purple: 318,
};

/** Каналы цвета из `#rrggbb`. */
function channels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/** Линейная составляющая канала sRGB — ступень расчёта светлоты. */
function linear(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

/** Относительная яркость по WCAG. */
function luminance(hex: string): number {
  const [red, green, blue] = channels(hex).map(linear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

/** Контраст по WCAG. */
function contrast(first: string, second: string): number {
  const a = luminance(first);
  const b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** OKLab: светлота, насыщенность и тон цвета. */
function oklch(hex: string): { lightness: number; chroma: number; hue: number } {
  const [r, g, b] = channels(hex).map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const axisB = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let hue = (Math.atan2(axisB, a) * 180) / Math.PI;
  if (hue < 0) {
    hue += 360;
  }
  return { lightness, chroma: Math.hypot(a, axisB), hue };
}

/** Расстояние между цветами в OKLab: воспринимаемая разница. */
function distance(first: string, second: string): number {
  const a = oklch(first);
  const b = oklch(second);
  const ax = a.chroma * Math.cos((a.hue * Math.PI) / 180);
  const ay = a.chroma * Math.sin((a.hue * Math.PI) / 180);
  const bx = b.chroma * Math.cos((b.hue * Math.PI) / 180);
  const by = b.chroma * Math.sin((b.hue * Math.PI) / 180);
  return Math.hypot(a.lightness - b.lightness, ax - bx, ay - by) * 100;
}

/** Разница тонов в градусах: «жёлтый остаётся жёлтым». */
function hueDistance(first: number, second: number): number {
  const difference = Math.abs(first - second) % 360;
  return difference > 180 ? 360 - difference : difference;
}

describe('значения пользовательских цветов', () => {
  it('держит природный тон каждого цвета во всех ступенях и сторонах', () => {
    // Дефект: смешение с подложкой уводило цвет — жёлтый становился серым,
    // зелёный бирюзовым, красный розовым. Готовое значение этого не допускает.
    for (const side of ['light', 'dark'] as const) {
      for (const color of ACCENT_COLORS) {
        for (const strength of STRENGTHS) {
          const { hue } = oklch(ACCENT_FILL_COLORS[side][color][strength]);
          expect(
            hueDistance(hue, HUE[color]),
            `${side}/${color}/${strength}: тон ${hue.toFixed(0)}°`,
          ).toBeLessThan(10);
        }
      }
    }
  });

  it('держит цвет собой: насыщенность достаточная, чтобы различать цвета', () => {
    // Дефект: заливки были приглушены до C 0.03–0.07, и цвет переставал быть
    // собой — красный уходил в бледно-бордовый, жёлтый в светло-коричневый, а
    // синий, зелёный, красный и фиолетовый становились почти неразличимы.
    // Нижний предел насыщенности возвращает цвету узнаваемость.
    const minimum: Record<AccentColor, number> = {
      yellow: 0.055,
      green: 0.055,
      blue: 0.045,
      red: 0.045,
      purple: 0.05,
    };
    for (const side of ['light', 'dark'] as const) {
      for (const color of ACCENT_COLORS) {
        for (const strength of STRENGTHS) {
          const { chroma } = oklch(ACCENT_FILL_COLORS[side][color][strength]);
          expect(
            chroma,
            `${side}/${color}/${strength}: насыщенность ${chroma.toFixed(3)}`,
          ).toBeGreaterThanOrEqual(minimum[color]);
        }
      }
    }
  });

  it('не теряет цвет в тёмной стороне: жёлтый золотой, а не коричневый', () => {
    // Глубокий приглушённый жёлтый неизбежно коричневый. В тёмной стороне
    // заливка жёлтого держится в светлой полосе, поэтому остаётся золотой.
    for (const strength of STRENGTHS) {
      const fill = ACCENT_FILL_COLORS.dark.yellow[strength];
      expect(oklch(fill).lightness, `жёлтый в тёмной теме (${strength})`).toBeGreaterThan(0.68);
    }
  });

  it('читается подписью на каждой заливке', () => {
    // Подпись одна на всё приложение: заливки держатся в полосе, где она читается.
    for (const side of ['light', 'dark'] as const) {
      for (const color of ACCENT_COLORS) {
        for (const strength of STRENGTHS) {
          const fill = ACCENT_FILL_COLORS[side][color][strength];
          const ink = ACCENT_INK_COLORS[side][color][strength];
          expect(
            contrast(fill, ink),
            `${side}/${color}/${strength}: подпись на заливке`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it('различает ступени: выбранное виднее невыбранного', () => {
    for (const side of ['light', 'dark'] as const) {
      for (const color of ACCENT_COLORS) {
        for (let index = 1; index < STRENGTHS.length; index += 1) {
          const previous = ACCENT_FILL_COLORS[side][color][STRENGTHS[index - 1]];
          const current = ACCENT_FILL_COLORS[side][color][STRENGTHS[index]];
          expect(
            distance(previous, current),
            `${side}/${color}: ${STRENGTHS[index - 1]} → ${STRENGTHS[index]}`,
          ).toBeGreaterThan(4.5);
        }
      }
    }
  });

  it('не путает цвета между собой на одной ступени', () => {
    for (const side of ['light', 'dark'] as const) {
      for (const strength of STRENGTHS) {
        for (let first = 0; first < ACCENT_COLORS.length; first += 1) {
          for (let second = first + 1; second < ACCENT_COLORS.length; second += 1) {
            const a = ACCENT_FILL_COLORS[side][ACCENT_COLORS[first]][strength];
            const b = ACCENT_FILL_COLORS[side][ACCENT_COLORS[second]][strength];
            expect(
              distance(a, b),
              `${side}/${strength}: ${ACCENT_COLORS[first]} и ${ACCENT_COLORS[second]}`,
            ).toBeGreaterThan(4);
          }
        }
      }
    }
  });
});
