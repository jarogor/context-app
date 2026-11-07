import { describe, expect, it } from 'vitest';

import {
  applyPalette,
  DEFAULT_PALETTE,
  isPaletteId,
  normalizePaletteId,
  PALETTES,
} from './palettes';

describe('реестр палитр', () => {
  it('содержит палитру по умолчанию', () => {
    expect(PALETTES.some((palette) => palette.id === DEFAULT_PALETTE)).toBe(true);
  });

  it('ставит палитру по умолчанию первой', () => {
    // Порядок реестра — порядок выбора: умолчание читается первым.
    expect(PALETTES[0].id).toBe(DEFAULT_PALETTE);
  });

  it('распознаёт известные идентификаторы', () => {
    for (const palette of PALETTES) {
      expect(isPaletteId(palette.id)).toBe(true);
      expect(normalizePaletteId(palette.id)).toBe(palette.id);
    }
  });

  it('приводит неизвестное значение к палитре по умолчанию', () => {
    expect(isPaletteId('solarized')).toBe(false);
    expect(normalizePaletteId('solarized')).toBe(DEFAULT_PALETTE);
    expect(normalizePaletteId(undefined)).toBe(DEFAULT_PALETTE);
  });

  it('называет палитры по-русски, одним складом', () => {
    // Названия — короткие русские существительные одного рода и склада, как
    // «Лён»: латиница в подписях выбивалась из остального интерфейса.
    const titles = PALETTES.map((palette) => palette.title);
    expect(titles).toEqual(['Туман (по умолчанию)', 'Лён', 'Индиго', 'Янтарь']);
    for (const title of titles) {
      // Пометка «по умолчанию» — приписка к названию, само название односложно.
      const [name] = title.split(' (');
      expect(name).toMatch(/^[А-ЯЁ][а-яё]+$/);
      expect(name.length).toBeLessThanOrEqual(8);
    }
  });

  it('даёт каждой палитре своё описание', () => {
    // Палитры должны быть различимы по характеру: две палитры с одним описанием
    // («нейтральная с синим акцентом») — это дубликаты.
    const descriptions = PALETTES.map((palette) => palette.description);
    expect(new Set(descriptions).size).toBe(descriptions.length);
  });
});

describe('applyPalette', () => {
  it('выставляет атрибут data-palette', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyPalette('cobalt', root);
    expect(root.dataset.palette).toBe('cobalt');
  });

  it('неизвестную палитру заменяет значением по умолчанию', () => {
    const root = { dataset: {} } as unknown as HTMLElement;

    applyPalette('неизвестная', root);
    expect(root.dataset.palette).toBe(DEFAULT_PALETTE);
  });
});
