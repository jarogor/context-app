import { describe, expect, it } from 'vitest';
import { nextZoom, ZOOM_LEVELS } from './zoom';

describe('прогрессивная шкала масштаба', () => {
  it('идёт по общей лестнице уровней вверх и вниз', () => {
    expect(nextZoom(100, 1, 5, 1000)).toBe(110);
    expect(nextZoom(110, 1, 5, 1000)).toBe(120);
    expect(nextZoom(110, -1, 5, 1000)).toBe(100);
    expect(nextZoom(100, -1, 5, 1000)).toBe(90);
  });

  it('обратима: шаг вверх и вниз возвращает к прежнему уровню', () => {
    for (const level of ZOOM_LEVELS) {
      if (level <= 5 || level >= 1000) {
        continue;
      }
      const up = nextZoom(level, 1, 5, 1000);
      const back = nextZoom(up, -1, 5, 1000);
      expect(back).toBe(level);
    }
  });

  it('прогрессивна: шаг растёт вместе с масштабом', () => {
    const smallStep = nextZoom(100, 1, 5, 1000) - 100;
    const largeStep = nextZoom(800, 1, 5, 1000) - 800;
    expect(largeStep).toBeGreaterThan(smallStep);
  });

  it('не застревает на нижней границе: минимум становится обычным уровнем', () => {
    // Прежняя беда: от 5 % увеличение давало 15, 25, … — сетка рвалась.
    expect(nextZoom(5, 1, 5, 1000)).toBe(10);
    expect(nextZoom(10, -1, 5, 1000)).toBe(5);
    expect(nextZoom(15, -1, 5, 1000)).toBe(10);
  });

  it('уважает границы диапазона', () => {
    expect(nextZoom(5, -1, 5, 1000)).toBe(5);
    expect(nextZoom(1000, 1, 5, 1000)).toBe(1000);
    // Тесный диапазон текстовых книг: уровни вне границ не берутся.
    expect(nextZoom(60, -1, 60, 220)).toBe(60);
    expect(nextZoom(210, 1, 60, 220)).toBe(220);
  });

  it('берёт ближайший уровень, если текущее значение не из лестницы', () => {
    expect(nextZoom(105, 1, 5, 1000)).toBe(110);
    expect(nextZoom(105, -1, 5, 1000)).toBe(100);
  });
});
