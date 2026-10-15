import { describe, expect, it } from 'vitest';

import { CHANNEL, decodeBase64, normalizeTool, parseIncoming } from './protocol';

describe('parseIncoming', () => {
  it('отбрасывает сообщения чужого канала', () => {
    expect(parseIncoming({ channel: 'other', type: 'open' })).toBeNull();
  });

  it('отбрасывает мусор и неизвестные типы', () => {
    expect(parseIncoming(null)).toBeNull();
    expect(parseIncoming('строка')).toBeNull();
    expect(parseIncoming({ channel: CHANNEL, type: 'неизвестно' })).toBeNull();
  });

  it('разбирает открытие книги с числами по умолчанию', () => {
    const message = parseIncoming({ channel: CHANNEL, type: 'open', data: 'AA==', position: '12', zoom: 140 });
    expect(message).toEqual({ type: 'open', data: 'AA==', position: 12, zoom: 140 });
    expect(parseIncoming({ channel: CHANNEL, type: 'open' })).toEqual({
      type: 'open',
      data: '',
      position: 0,
      zoom: 100,
    });
  });

  it('разбирает масштаб', () => {
    expect(parseIncoming({ channel: CHANNEL, type: 'zoom', value: 150 })).toEqual({ type: 'zoom', value: 150 });
  });

  it('сохраняет параметры перехода', () => {
    expect(
      parseIncoming({ channel: CHANNEL, type: 'goto', value: { page: 3, noteId: 'n1' } }),
    ).toEqual({ type: 'goto', value: { page: 3, noteId: 'n1' } });
    expect(parseIncoming({ channel: CHANNEL, type: 'goto' })).toEqual({ type: 'goto', value: {} });
  });

  it('разбирает список заметок и отбрасывает не-массив', () => {
    expect(parseIncoming({ channel: CHANNEL, type: 'notes', value: [{ id: 'n1' }] })).toEqual({
      type: 'notes',
      value: [{ id: 'n1' }],
    });
    expect(parseIncoming({ channel: CHANNEL, type: 'notes', value: 'нет' })).toEqual({
      type: 'notes',
      value: [],
    });
  });

  it('нормализует инструмент значениями по умолчанию', () => {
    expect(parseIncoming({ channel: CHANNEL, type: 'tool', value: { type: 'text', color: 'red' } })).toEqual({
      type: 'tool',
      value: { type: 'text', shape: 'line', color: 'red' },
    });
    expect(normalizeTool(undefined)).toEqual({ type: 'quote', shape: 'line', color: 'yellow' });
  });

  it('разбирает тему и сигнал видимости', () => {
    expect(
      parseIncoming({ channel: CHANNEL, type: 'reader-theme', value: { id: 'dark' } }),
    ).toEqual({ type: 'reader-theme', value: { id: 'dark' } });
    expect(parseIncoming({ channel: CHANNEL, type: 'show' })).toEqual({ type: 'show' });
  });
});

describe('decodeBase64', () => {
  it('раскладывает base64 в байты', () => {
    expect(Array.from(decodeBase64('AQID'))).toEqual([1, 2, 3]);
    expect(decodeBase64('').length).toBe(0);
  });
});
