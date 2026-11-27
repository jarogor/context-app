import { afterAll, expect, it, vi } from 'vitest';

/** Кадры отрисовки: jsdom не запускает `requestAnimationFrame` сам. */
const frames: FrameRequestCallback[] = [];
const requestFrame = vi
  .spyOn(window, 'requestAnimationFrame')
  .mockImplementation((callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });

afterAll(() => {
  requestFrame.mockRestore();
});

it('показ вкладки перерисовывает книгу', async () => {
  // Дефект: при возврате на вкладку текст не появлялся, пока не шевельнёшь
  // прокрутку. WebKitGTK не перерисовывает уже показанный текст без внешнего
  // сигнала, и `show` обязан его дать: сдвиг `scrollTop` на пиксель и обратно.
  const scrolling = document.scrollingElement ?? document.documentElement;
  let stored = 40;
  const written: number[] = [];
  Object.defineProperty(scrolling, 'scrollTop', {
    configurable: true,
    get: () => stored,
    set: (value: number) => {
      stored = value;
      written.push(value);
    },
  });

  try {
    await import('./main');
    window.postMessage({ channel: 'context-workplace', type: 'show' }, '*');
    // Сообщение доходит до обработчика в следующей задаче.
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Перерисовка идёт следующим кадром, а не внутри обработчика сообщения.
    expect(frames.length).toBeGreaterThan(0);
    for (const callback of frames) {
      callback(0);
    }
    expect(written).toContain(41);
    expect(stored).toBe(40);
  } finally {
    delete (scrolling as unknown as { scrollTop?: number }).scrollTop;
  }
});
