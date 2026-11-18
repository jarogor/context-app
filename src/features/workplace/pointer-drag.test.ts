import { describe, expect, it, vi } from 'vitest';
import { trackPointerDrag } from './pointer-drag';

/** Отправка события указателя на окно. */
function fire(type: string, init: PointerEventInit = {}): void {
  window.dispatchEvent(
    new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, ...init }),
  );
}

describe('перетаскивание указателем', () => {
  it('не начинает перенос от случайного сдвига', () => {
    // Дефект: нативный перенос начинался от любого движения и оставлял элемент
    // серым. Здесь перенос стартует только после заметного сдвига.
    const onStart = vi.fn();
    const onEnd = vi.fn();
    trackPointerDrag({
      pointerId: 1,
      startX: 100,
      startY: 100,
      hitTest: () => 'b',
      onStart,
      onMove: vi.fn(),
      onEnd,
    });

    fire('pointermove', { clientX: 101, clientY: 101 });
    fire('pointerup', { clientX: 101, clientY: 101 });

    expect(onStart).not.toHaveBeenCalled();
    expect(onEnd).toHaveBeenCalledWith(null, false);
  });

  it('начинает перенос после сдвига и сообщает цель', () => {
    const onStart = vi.fn();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    trackPointerDrag({
      pointerId: 1,
      startX: 100,
      startY: 100,
      hitTest: () => 'b',
      onStart,
      onMove,
      onEnd,
    });

    fire('pointermove', { clientX: 140, clientY: 100 });
    fire('pointerup', { clientX: 140, clientY: 100 });

    expect(onStart).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith('b');
    expect(onEnd).toHaveBeenCalledWith('b', true);
  });

  it('возвращает курсор и выделение после переноса', () => {
    // Дефект: курсор заедал стрелкой, пока не тронешь границу окна. Стили
    // страницы снимаются при любом окончании переноса.
    trackPointerDrag({
      pointerId: 1,
      startX: 0,
      startY: 0,
      hitTest: () => null,
      onStart: vi.fn(),
      onMove: vi.fn(),
      onEnd: vi.fn(),
    });

    fire('pointermove', { clientX: 30, clientY: 0 });
    expect(document.documentElement.hasAttribute('data-dragging')).toBe(true);
    fire('pointerup', { clientX: 30, clientY: 0 });
    expect(document.documentElement.hasAttribute('data-dragging')).toBe(false);
  });

  it('снимает стили страницы и при отмене переноса', () => {
    const onEnd = vi.fn();
    trackPointerDrag({
      pointerId: 1,
      startX: 0,
      startY: 0,
      hitTest: () => null,
      onStart: vi.fn(),
      onMove: vi.fn(),
      onEnd,
    });

    fire('pointermove', { clientX: 30, clientY: 0 });
    fire('pointercancel', { clientX: 30, clientY: 0 });

    expect(document.documentElement.hasAttribute('data-dragging')).toBe(false);
    expect(onEnd).toHaveBeenCalledWith(null, true);
  });

  it('отменяет нажатие сразу после переноса', () => {
    // Дефект: перенос вкладки ещё и выбирал её, а перенос по кнопке меню
    // открывал меню. Нажатие, следующее за отпусканием, отменяется.
    const onClick = vi.fn();
    trackPointerDrag({
      pointerId: 1,
      startX: 0,
      startY: 0,
      hitTest: () => 'b',
      onStart: vi.fn(),
      onMove: vi.fn(),
      onEnd: vi.fn(),
    });

    fire('pointermove', { clientX: 30, clientY: 0 });
    window.addEventListener('click', onClick);
    fire('pointerup', { clientX: 30, clientY: 0 });
    window.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('игнорирует события другого указателя', () => {
    const onEnd = vi.fn();
    trackPointerDrag({
      pointerId: 1,
      startX: 0,
      startY: 0,
      hitTest: () => null,
      onStart: vi.fn(),
      onMove: vi.fn(),
      onEnd,
    });

    window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 2 }));

    expect(onEnd).not.toHaveBeenCalled();
  });
});
