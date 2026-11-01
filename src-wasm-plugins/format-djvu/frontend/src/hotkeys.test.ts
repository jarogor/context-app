import { describe, expect, it } from 'vitest';

import { isTextEntry, matchBinding, type ViewerBinding } from './hotkeys';

/** Привязка для проверки. */
function binding(overrides: Partial<ViewerBinding> = {}): ViewerBinding {
  return {
    id: 'reader.screen.next',
    code: 'PageDown',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
    ...overrides,
  };
}

/** Событие клавиатуры с заданными полями. */
function keydown(overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    code: 'PageDown',
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...overrides,
  } as KeyboardEvent;
}

describe('привязки клавиш в модуле рисования', () => {
  it('находит привязку по физическому коду и модификаторам', () => {
    const bindings = [binding(), binding({ id: 'reader.zoom.in', code: 'Equal', ctrl: true })];
    expect(matchBinding(bindings, keydown())?.id).toBe('reader.screen.next');
    expect(matchBinding(bindings, keydown({ code: 'Equal', ctrlKey: true }))?.id).toBe('reader.zoom.in');
  });

  it('не путает комбинации с разными модификаторами', () => {
    const bindings = [binding()];
    // Ctrl+PageDown — другая комбинация, а не та же самая.
    expect(matchBinding(bindings, keydown({ ctrlKey: true }))).toBeNull();
    expect(matchBinding(bindings, keydown({ shiftKey: true }))).toBeNull();
  });

  it('не сопоставляет событие без физического кода', () => {
    expect(matchBinding([binding()], keydown({ code: '' }))).toBeNull();
  });

  it('не распознаёт клавиши в поле ввода и редактируемой области', () => {
    const input = document.createElement('input');
    const area = document.createElement('div');
    area.setAttribute('contenteditable', 'true');
    expect(isTextEntry(input)).toBe(true);
    expect(isTextEntry(area)).toBe(true);
    expect(isTextEntry(document.createElement('div'))).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });
});
