import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FLASH_MS, PULSE_GAP_MS, PULSE_MS, flashNote, flashTwice } from './flash';

beforeEach(() => {
  vi.useFakeTimers();
});

describe('двойная вспышка заметки при переходе', () => {
  it('включает, гасит и снова включает вспышку в том же окне', () => {
    const states: string[] = [];
    flashTwice(
      () => states.push('вкл'),
      () => states.push('выкл'),
    );

    // Первый импульс — сразу.
    expect(states).toEqual(['вкл']);
    vi.advanceTimersByTime(PULSE_MS);
    expect(states).toEqual(['вкл', 'выкл']);
    vi.advanceTimersByTime(PULSE_GAP_MS);
    // Второй импульс: мигание дважды, а не единожды.
    expect(states).toEqual(['вкл', 'выкл', 'вкл']);
    vi.advanceTimersByTime(PULSE_MS);
    expect(states).toEqual(['вкл', 'выкл', 'вкл', 'выкл']);
  });

  it('укладывает оба импульса в прежние 300 мс', () => {
    // Раньше вспышка длилась 300 мс и гасила заметку один раз.
    expect(FLASH_MS).toBeLessThanOrEqual(300);
  });

  it('даёт фигуре рамку области на всё время вспышки', () => {
    const shape = document.createElement('div');
    const framed: boolean[] = [];
    flashNote(
      [],
      [shape],
      () => undefined,
      () => undefined,
      () => framed.push(true),
      () => framed.push(false),
    );

    expect(framed).toEqual([true]);
    vi.advanceTimersByTime(FLASH_MS);
    // Рамка снимается вместе со второй вспышкой, а не остаётся навсегда.
    expect(framed).toEqual([true, false]);
  });

  it('не рисует рамку подсветке цитаты', () => {
    const mark = document.createElement('div');
    const framed: boolean[] = [];
    flashNote(
      [mark],
      [],
      () => undefined,
      () => undefined,
      () => framed.push(true),
      () => framed.push(false),
    );

    vi.advanceTimersByTime(FLASH_MS);
    expect(framed).toEqual([]);
  });
});
