import { describe, expect, it } from 'vitest';
import { t } from '@context/i18n';

import {
  comboId,
  comboOfEvent,
  eventKeyCode,
  formatCombo,
  normalizeKeyName,
  parseCombo,
  type KeyEventLike,
} from './key-combo';

/** Событие клавиатуры с заданной клавишей и модификаторами. */
function keyEvent(overrides: Partial<KeyEventLike> = {}): KeyEventLike {
  return {
    key: 'f',
    code: 'KeyF',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  };
}

describe('нормализация клавиши', () => {
  it('приводит буквы и цифры к физическому коду', () => {
    expect(normalizeKeyName('f')).toBe('KeyF');
    expect(normalizeKeyName('F')).toBe('KeyF');
    expect(normalizeKeyName('KeyF')).toBe('KeyF');
    expect(normalizeKeyName('1')).toBe('Digit1');
    expect(normalizeKeyName('Digit1')).toBe('Digit1');
    expect(normalizeKeyName('F3')).toBe('F3');
  });

  it('понимает привычные имена клавиш и символы', () => {
    expect(normalizeKeyName('esc')).toBe('Escape');
    expect(normalizeKeyName('PageDown')).toBe('PageDown');
    expect(normalizeKeyName('pagedown')).toBe('PageDown');
    expect(normalizeKeyName('Comma')).toBe('Comma');
    expect(normalizeKeyName(',')).toBe('Comma');
    expect(normalizeKeyName('=')).toBe('Equal');
  });

  it('отклоняет неизвестную клавишу', () => {
    expect(() => normalizeKeyName('')).toThrow();
    expect(() => normalizeKeyName('Несуществующая')).toThrow();
  });
});

describe('разбор записи комбинации', () => {
  it('разбирает модификаторы в любом порядке и регистре', () => {
    const combo = parseCombo('shift+ctrl+f');
    expect(combo).toEqual({
      code: 'KeyF',
      ctrl: true,
      alt: false,
      shift: true,
      meta: false,
    });
  });

  it('понимает псевдонимы модификаторов', () => {
    expect(parseCombo('Control+Alt+Meta+X').ctrl).toBe(true);
    expect(parseCombo('Control+Alt+Meta+X').alt).toBe(true);
    expect(parseCombo('Control+Alt+Meta+X').meta).toBe(true);
    expect(parseCombo('Cmd+X').meta).toBe(true);
    expect(parseCombo('Option+X').alt).toBe(true);
  });

  it('даёт одинаковый идентификатор для одной и той же комбинации', () => {
    expect(comboId(parseCombo('Ctrl+Shift+F'))).toBe('Ctrl+Shift+KeyF');
    expect(comboId(parseCombo('Shift+Ctrl+f'))).toBe('Ctrl+Shift+KeyF');
    expect(comboId(parseCombo('Ctrl+, '))).toBe('Ctrl+Comma');
  });

  it('отклоняет пустую запись и неизвестный модификатор', () => {
    expect(() => parseCombo('')).toThrow();
    expect(() => parseCombo('Hyper+F')).toThrow();
  });
});

describe('комбинация события', () => {
  it('берёт физический код, а не символ раскладки', () => {
    // Русская раскладка: символ «а», но физически та же клавиша F.
    const combo = comboOfEvent(keyEvent({ key: 'а', code: 'KeyF', ctrlKey: true }));
    expect(comboId(combo)).toBe('Ctrl+KeyF');
  });

  it('при отсутствии кода выводит его из символа', () => {
    expect(eventKeyCode({ key: 'F' })).toBe('KeyF');
    expect(eventKeyCode({ key: 'PageDown' })).toBe('PageDown');
    expect(eventKeyCode({ key: 'а' })).toBe('а');
  });
});

describe('показ комбинации', () => {
  it('показывает модификаторы и клавишу по-человечески', () => {
    expect(formatCombo(parseCombo('Ctrl+Shift+F'))).toBe('Ctrl+Shift+F');
    expect(formatCombo(parseCombo('Ctrl+1'))).toBe('Ctrl+1');
    expect(formatCombo(parseCombo('Ctrl+,'))).toBe('Ctrl+,');
    expect(formatCombo(parseCombo('Escape'))).toBe('Escape');
    expect(formatCombo(parseCombo('PageDown'))).toBe('Page Down');
    expect(formatCombo(parseCombo('Space'))).toBe(t('app.hotkey.space'));
  });
});
