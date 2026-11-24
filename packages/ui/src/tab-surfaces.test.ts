import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Проверка ступеней строк списков во всех восьми наборах темы.
 *
 * У строки списка (вкладка, заметка) три состояния: неактивная, под курсором
 * и выбранная. Раньше неактивная была прозрачной и сливалась с полосой, а
 * после — стала контрастнее наведения, и порядок ступеней перевернулся.
 * Здесь проверяется правильный порядок: фон → строка → курсор → выбор, причём
 * соседние ступени отличаются немного, а выбор — заметнее прочих.
 *
 * Цвета считаются по объявлениям палитры и WCAG: тест ловит подбор «на глаз»,
 * который и разъезжался между темами.
 */

/** Содержимое файла токенов дизайн-системы. */
const tokens = readFileSync(resolve(process.cwd(), 'src/tokens.css'), 'utf8');

/** Каналы цвета из `#rrggbb` в 0–255. */
function channels(value: string): number[] {
  const hex = value.replace('#', '');
  return [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16));
}

/** Относительная яркость цвета по WCAG. */
function luminance(value: string): number {
  const [r, g, b] = channels(value).map((channel) => {
    const unit = channel / 255;
    return unit <= 0.04045 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Контраст двух цветов по WCAG. */
function contrast(first: string, second: string): number {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** Смешение двух цветов с долей первого — как объявлено в токенах. */
function mix(first: string, second: string, ratio: number): string {
  const a = channels(first);
  const b = channels(second);
  return `#${a
    .map((channel, index) => Math.round(channel * ratio + b[index] * (1 - ratio)))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/** Объявление токена любой формы (для проверки формулы). */
function declaration(name: string): string {
  return new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens)?.[1]?.trim() ?? '';
}

/** Блоки тем: у каждого объявлен фон полосы — это все восемь наборов. */
function themeBlocks(): Array<{ name: string; dark: boolean; block: string }> {
  // Комментарии снимаются: в них упоминается селектор тёмной стороны, и
  // проверка по селектору иначе срабатывала бы на светлом блоке.
  const source = tokens.replace(/\/\*[\s\S]*?\*\//g, '');
  return Array.from(source.matchAll(/:root([^{]*)\{([\s\S]*?)\n\}/g))
    .map((match) => ({
      name: match[1].trim() || 'по умолчанию',
      dark: /data-theme='dark'/.test(match[1]),
      block: match[2],
    }))
    .filter(({ block }) => block.includes('--app-bar-strip:'));
}

describe('ступени строк списков во всех наборах темы', () => {
  const themes = themeBlocks();

  /** Значение токена-цвета с учётом ссылки на другой токен. */
  function color(block: string, name: string, depth = 0): string {
    const raw = new RegExp(`--${name}:\\s*([^;]+);`).exec(block)?.[1]?.trim() ?? '';
    const reference = /^var\(--([a-z0-9-]+)\)$/.exec(raw);
    if (reference && depth < 5) {
      return color(block, reference[1], depth + 1);
    }
    return raw;
  }

  /** Поверхности строки по формулам из `tokens.css`. */
  function surfaces(
    block: string,
    dark: boolean,
  ): { panel: string; inactive: string; hover: string; active: string } {
    const panel = color(block, 'app-bar-strip');
    // Светлая сторона: активная — карточка. Тёмная: ступень выделения; она
    // заметно светлее полосы и не выбивается из гаммы, как подмешивание текста.
    const active = dark ? color(block, 'selected-fill') : color(block, 'card');
    // Неактивная — тихая ступень наведения, курсор — середина до выбранной.
    const inactive = color(block, 'hover-fill');
    const hover = mix(active, panel, 0.5);
    return { panel, inactive, hover, active };
  }

  it('находит восемь наборов', () => {
    expect(themes).toHaveLength(8);
  });

  it('выводит ступень наведения смешением, а не отдельным цветом', () => {
    // Отдельные значения по палитрам уже разъезжались между темами.
    expect(declaration('tab-hover-surface')).toContain('color-mix');
    expect(declaration('tab-hover-surface')).toContain('--tab-active-surface');
    expect(declaration('tab-hover-surface')).toContain('--panel');
  });

  it('держит порядок ступеней: фон → строка → курсор → выбор', () => {
    for (const { name, dark, block } of themes) {
      const { panel, inactive, hover, active } = surfaces(block, dark);

      const inactiveToPanel = contrast(inactive, panel);
      const hoverToPanel = contrast(hover, panel);
      const activeToPanel = contrast(active, panel);

      // Строка всего лишь заметна на фон, а не спорит с ним.
      expect(inactiveToPanel, `${name}: строка к фону`).toBeGreaterThan(1.1);
      expect(inactiveToPanel, `${name}: строка не ярче наведения`).toBeLessThan(hoverToPanel);
      // Наведение отзывается, но остаётся слабее выбора.
      expect(hoverToPanel, `${name}: наведение к фону`).toBeLessThan(activeToPanel);
      // Выбор виден заметно сильнее прочих ступеней.
      expect(activeToPanel - inactiveToPanel, `${name}: запас выбора`).toBeGreaterThan(0.3);
    }
  });
});
