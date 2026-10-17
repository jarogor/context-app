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
