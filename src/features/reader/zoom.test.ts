import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createZoomCoalescer, nextZoom, ZOOM_IDLE_DELAY, ZOOM_MAX_DELAY } from './zoom';

describe('nextZoom', () => {
  it('переходит к соседнему уровню и остаётся обратимым', () => {
    expect(nextZoom(100, 1, 5, 1000)).toBe(110);
    expect(nextZoom(110, -1, 5, 1000)).toBe(100);
  });

  it('учитывает границы диапазона', () => {
    expect(nextZoom(60, -1, 60, 220)).toBe(60);
    expect(nextZoom(220, 1, 60, 220)).toBe(220);
  });
});

describe('createZoomCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('применяет одиночный запрос после паузы', () => {
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    zoom.request(110);
    expect(applied).toEqual([]);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY);
    expect(applied).toEqual([110]);
  });

  it('склеивает короткую серию в одно применение — последнее значение', () => {
    // Ровно тот дефект, ради которого склейка: нажатия подряд
    // перерисовывали каждый промежуточный масштаб.
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    // Три клика по 180 мс: серия короче предела ожидания.
    for (const value of [290, 280, 270]) {
      zoom.request(value);
      vi.advanceTimersByTime(180);
    }
    expect(applied).toEqual([]);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY);
    expect(applied).toEqual([270]);
  });

  it('долгую серию применяет по пределу, не дожидаясь конца', () => {
    // Десять кликов — это дольше предела: масштаб обязан применяться по
    // ходу, иначе интерфейс выглядел бы зависшим.
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    for (const value of [290, 280, 270, 260, 250, 240, 230, 220, 210, 200]) {
      zoom.request(value);
      vi.advanceTimersByTime(180);
    }
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY);
    // Применений меньше, чем кликов: промежуточные пропущены.
    expect(applied.length).toBeGreaterThan(0);
    expect(applied.length).toBeLessThan(10);
    expect(applied[applied.length - 1]).toBe(200);
  });

  it('склеивает смену направления так же, как движение в одну сторону', () => {
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    zoom.request(90);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY - 10);
    zoom.request(80);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY - 10);
    zoom.request(100);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY);
    expect(applied).toEqual([100]);
  });

  it('применяет накопленное по пределу ожидания', () => {
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    // Нажатия идут непрерывно дольше предела (зажатая кнопка): масштаб всё
    // равно применяется, иначе он откладывался бы бесконечно.
    const clicks = Math.ceil(ZOOM_MAX_DELAY / 60) + 10;
    for (let index = 0; index < clicks; index += 1) {
      zoom.request(200 - (index % 100));
      vi.advanceTimersByTime(60);
    }
    expect(applied.length).toBeGreaterThan(0);
  });

  it('новая серия после паузы дольше предела считается отдельной', () => {
    // Дефект: `startedAt` оставался от прошлой серии, и первый клик новой
    // применялся мгновенно — серия распадалась на шаги.
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    zoom.request(200);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY);
    expect(applied).toEqual([200]);

    // Пауза заметно больше предела: следующая серия начинается заново и
    // тоже ждёт затишья, а не применяется мгновенно.
    vi.advanceTimersByTime(1000);
    zoom.request(180);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY - 10);
    zoom.request(170);
    vi.advanceTimersByTime(ZOOM_IDLE_DELAY);
    expect(applied).toEqual([200, 170]);
  });

  it('немедленно применяет накопленное по требованию', () => {
    const applied: number[] = [];
    const zoom = createZoomCoalescer((value) => applied.push(value));
    zoom.request(120);
    zoom.request(130);
    zoom.flush();
    expect(applied).toEqual([130]);
  });
});
