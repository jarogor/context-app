import { describe, expect, it } from 'vitest';

import { HOTKEY_ACTIONS, type HotkeyAction } from './actions';
import { createHotkeyRegistry, findHotkey, hotkeyHint, hotkeyLabel } from './registry';
import { parseCombo } from './key-combo';

/** Действие для проверки реестра. */
function action(
  id: string,
  bindings: string[],
  scope: HotkeyAction['scope'] = 'app',
): HotkeyAction {
  return { id, title: id, group: 'sections', scope, bindings };
}

describe('реестр привязок', () => {
  it('каталог приложения не содержит конфликтов и пустых привязок', () => {
    expect(() => createHotkeyRegistry(HOTKEY_ACTIONS)).not.toThrow();
    // Каждое действие имеет хотя бы одну комбинацию.
    for (const item of HOTKEY_ACTIONS) {
      expect(item.bindings.length).toBeGreaterThan(0);
    }
  });

  it('не собирается, если одно сочетание назначено двум действиям', () => {
    expect(() =>
      createHotkeyRegistry([action('first', ['Ctrl+F']), action('second', ['Ctrl+KeyF'])]),
    ).toThrow(/двум действиям/);
  });

  it('не собирается при повторе идентификатора или пустых привязках', () => {
    expect(() =>
      createHotkeyRegistry([action('same', ['Ctrl+A']), action('same', ['Ctrl+B'])]),
    ).toThrow(/повторяющийся/);
    expect(() => createHotkeyRegistry([action('empty', [])])).toThrow(/без привязки/);
  });

  it('принимает переопределения и отклоняет неизвестное действие', () => {
    const registry = createHotkeyRegistry([action('first', ['Ctrl+F'])], {
      first: ['Ctrl+KeyG'],
    });
    expect(findHotkey(parseCombo('Ctrl+G'), registry)?.action.id).toBe('first');
    expect(findHotkey(parseCombo('Ctrl+F'), registry)).toBeNull();
    expect(() =>
      createHotkeyRegistry([action('first', ['Ctrl+F'])], { other: ['Ctrl+H'] }),
    ).toThrow(/неизвестного действия/);
  });

  it('находит привязку независимо от регистра и порядка модификаторов', () => {
    const registry = createHotkeyRegistry([action('first', ['Ctrl+Shift+F'])]);
    expect(findHotkey(parseCombo('shift+ctrl+f'), registry)?.action.id).toBe('first');
  });

  it('перечисляет несколько привязок действия в подписи', () => {
    const registry = createHotkeyRegistry([action('zoom', ['Ctrl+Equal', 'Ctrl+NumpadAdd'])]);
    expect(hotkeyLabel('zoom', registry)).toBe('Ctrl+=, Ctrl+Numpad +');
    expect(hotkeyLabel('missing', registry)).toBe('');
  });

  it('подсказка кнопки называет и назначение, и комбинацию', () => {
    // Каталог приложения — единственный источник подписей для подсказок:
    // у масштаба две привязки (обычная клавиша и Numpad), обе попадают в подсказку.
    expect(hotkeyHint('reader.zoom.in', 'Увеличить масштаб')).toBe(
      'Увеличить масштаб (Ctrl+=, Ctrl+Numpad +)',
    );
    expect(hotkeyHint('нет такого', 'Действие')).toBe('Действие');
  });
});
