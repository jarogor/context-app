/** Двойная вспышка заметки при переходе из списка.
 *
 * Заметка должна привлечь внимание, но не отвлечь от чтения: вспышка двойная —
 * два импульса в прежнем окне в 300 мс. Одиночное приглушение было почти
 * незаметным, особенно на пёстрой странице.
 */

/** Длительность одного импульса в миллисекундах. */
export const PULSE_MS = 140;
/** Пауза между импульсами: два импульса укладываются в прежние 300 мс. */
export const PULSE_GAP_MS = 20;
/** Полная длительность вспышки: оба импульса и пауза между ними. */
export const FLASH_MS = PULSE_MS * 2 + PULSE_GAP_MS;

/**
 * Двойная вспышка одного элемента.
 *
 * @param on Включение вспышки.
 * @param off Снятие вспышки.
 */
export function flashTwice(on: () => void, off: () => void): void {
  on();
  setTimeout(() => {
    off();
    setTimeout(() => {
      on();
      setTimeout(off, PULSE_MS);
    }, PULSE_GAP_MS);
  }, PULSE_MS);
}

/**
 * Вспышка набора элементов с рамкой для фигур.
 *
 * Фигуры получают ещё и рамку на всё время вспышки: жёлтая линия на белой
 * бумаге видна плохо, и мигание её не спасает — нужен контрастный контур
 * области.
 *
 * @param marks Подсветки цитат и текстовые карточки.
 * @param shapes Фигуры: им нужна рамка области.
 * @param on Включение вспышки элемента.
 * @param off Снятие вспышки элемента.
 * @param frame Включение рамки области фигуры.
 * @param unframe Снятие рамки области фигуры.
 */
export function flashNote(
  marks: Element[],
  shapes: Element[],
  on: (element: Element) => void,
  off: (element: Element) => void,
  frame: (element: Element) => void,
  unframe: (element: Element) => void,
): void {
  for (const mark of marks) {
    flashTwice(
      () => on(mark),
      () => off(mark),
    );
  }
  for (const shape of shapes) {
    flashTwice(
      () => on(shape),
      () => off(shape),
    );
    frame(shape);
    setTimeout(() => unframe(shape), FLASH_MS);
  }
}
