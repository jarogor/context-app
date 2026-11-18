/** Перетаскивание элементов списка указателем.
 *
 * Нативный HTML5 drag-and-drop в WebKitGTK (окно приложения) работает
 * нестабильно: после случайного сдвига элемент остаётся серым, курсор заедает
 * стрелкой до тех пор, пока не тронешь границу окна, а сам перенос часто не
 * срабатывает вовсе. Поэтому перестановка строится на событиях указателя:
 * нажатие запоминается, перенос начинается после небольшого сдвига, а цель
 * определяется по элементу под курсором.
 *
 * Модуль не знает о вкладках и элементах: он сообщает начало, смену цели и
 * конец перетаскивания, а разметку и порядок меняет вызывающий.
 */

/** Сдвиг указателя в пикселях, после которого нажатие считается переносом.
 *
 * Порог отделяет перенос от нажатия: случайное дрожание руки при клике не
 * должно начинать перетаскивание.
 */
const DRAG_THRESHOLD_PX = 5;

/** Признак идущего переноса на корне документа.
 *
 * По нему оформление гасит курсор и выделение на всё время переноса: курсор
 * под курсором может быть у любого дочернего элемента, поэтому одного
 * `style.cursor` у `body` недостаточно.
 */
const DRAG_ATTRIBUTE = 'data-dragging';

/** Параметры слежения за указателем. */
export interface PointerDragOptions {
  /** Идентификатор указателя, начавшего нажатие. */
  pointerId: number;
  /** Координата нажатия по горизонтали. */
  startX: number;
  /** Координата нажатия по вертикали. */
  startY: number;
  /** Идентификатор элемента под точкой экрана; `null` — элемента нет. */
  hitTest: (x: number, y: number) => string | null;
  /** Перенос начался: элемент можно подсветить. */
  onStart: () => void;
  /** Цель под курсором сменилась; `null` — курсор вне целей. */
  onMove: (targetId: string | null) => void;
  /** Перенос окончен: `targetId` — цель, `moved` — был ли перенос начат. */
  onEnd: (targetId: string | null, moved: boolean) => void;
}

/** Возврат страницы в обычное состояние после переноса.
 *
 * Признак переноса задаётся на время перетаскивания; его нужно снять при любом
 * окончании, иначе курсор и запрет выделения останутся висеть на всей
 * странице.
 */
function resetPageStyles(): void {
  document.documentElement.removeAttribute(DRAG_ATTRIBUTE);
}

/** Слежение за переносом до отпускания указателя.
 *
 * Слушатели ставятся на `window`, а не на сам элемент: указатель уходит за его
 * пределы, и только так движение и отпускание не теряются.
 */
export function trackPointerDrag(options: PointerDragOptions): void {
  const { pointerId, startX, startY } = options;
  let started = false;
  let targetId: string | null = null;

  /** Окончание слежения: снятие слушателей и оформления. */
  const cleanup = (): void => {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', finish);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    resetPageStyles();
  };

  /** Отмена нажатия после переноса.
   *
   * Перенос заканчивается отпусканием указателя, и браузер после него посылает
   * `click`. Без отмены перенос вкладки ещё и выбирал бы её, а перенос по
   * кнопке меню открывал бы меню.
   *
   * Слушатель одноразовый: он снимает себя и при отмене, и после первого
   * нажатия, чтобы не глушить обычные клики дальше по интерфейсу.
   */
  const suppressClick = (event: MouseEvent): void => {
    event.stopPropagation();
    event.preventDefault();
    window.removeEventListener('click', suppressClick, true);
    window.removeEventListener('pointerdown', suppressClickStart, true);
  };

  /** Снятие отмены нажатия, если нажатия так и не последовало. */
  const suppressClickStart = (): void => {
    window.removeEventListener('click', suppressClick, true);
    window.removeEventListener('pointerdown', suppressClickStart, true);
  };

  const finish = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    const moved = started;
    cleanup();
    options.onEnd(targetId, moved);
    if (moved) {
      // `click` приходит сразу после `pointerup`, поэтому отмена ставится
      // здесь же и снимает себя первым нажатием.
      window.addEventListener('click', suppressClick, true);
      window.addEventListener('pointerdown', suppressClickStart, true);
    }
  };

  const cancel = (): void => {
    cleanup();
    options.onEnd(null, started);
  };

  const move = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) {
      return;
    }
    if (!started) {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) {
        return;
      }
      started = true;
      document.documentElement.setAttribute(DRAG_ATTRIBUTE, 'true');
      options.onStart();
    }
    // Движение при переносе не должно прокручивать страницу или выделять текст.
    event.preventDefault();
    const next = options.hitTest(event.clientX, event.clientY);
    if (next !== targetId) {
      targetId = next;
      options.onMove(next);
    }
  };

  window.addEventListener('pointermove', move, { passive: false });
  window.addEventListener('pointerup', finish);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
}
