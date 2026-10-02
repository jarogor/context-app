<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button } from '@texture/ui';
  import type { BookContent } from './reader';
  import type { Note } from './notes';
  import {
    createAnchor,
    offsetsFromRange,
    parseAnchor,
    rangeFromOffsets,
    type QuoteAnchor,
  } from './reader/anchor';
  import { clearNoteMarks, highlightTextRange } from './reader/highlight';

  interface Props {
    /** Содержимое книги главами. */
    content: BookContent;
    /** Масштаб текста в процентах. */
    zoom: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Заметки-цитаты книги для подсветки. */
    notes?: Note[];
    /** Видима ли область чтения. */
    visible?: boolean;
    /** Выделение пользователя, ставшее цитатой. */
    onQuote?: (anchor: QuoteAnchor) => void;
    /** Изменение прогресса чтения в процентах. */
    onProgress?: (percent: number) => void;
    /** Выбор существующей заметки кликом по подсветке. */
    onSelectNote?: (noteId: string) => void;
  }

  let {
    content,
    zoom,
    initialPosition = 0,
    notes = [],
    visible = true,
    onQuote,
    onProgress,
    onSelectNote,
  }: Props = $props();

  /** Класс подсветки заметки. */
  const NOTE_CLASS = 'texture-note';
  /** Класс временной вспышки подсветки при переходе. */
  const FLASH_CLASS = 'texture-note-flash';
  /** Отступ сверху до опорной строки при масштабировании, в пикселях. */
  const ZOOM_ANCHOR_MARGIN = 18;

  /** Область отображения книги. */
  let frame: HTMLIFrameElement | undefined = $state();
  /** Документ книги после загрузки области. */
  let doc: Document | null = $state(null);
  /** Начальная позиция, взятая один раз при создании вкладки. */
  const startPosition = untrack(() => initialPosition);
  /** Живой диапазон опорной строки для удержания места при перестройке. */
  let anchorRange: Range | null = null;
  /** Экранная координата опорной строки в момент захвата. */
  let anchorTop = 0;

  /** Незавершённое выделение для создания заметки. */
  let pendingAnchor: QuoteAnchor | null = $state(null);
  /** Позиция контекстного меню выделения (координаты области чтения). */
  let menuPosition: { x: number; y: number } | null = $state(null);
  /** Ширина и высота области чтения для удержания меню внутри неё. */
  let readerAreaWidth = $state(0);
  let readerAreaHeight = $state(0);

  /** Ограничение позиции меню внутри области чтения. */
  function menuStyle(): string {
    const menuWidth = 190;
    const menuHeight = 40;
    const x = Math.max(
      8,
      Math.min(menuPosition?.x ?? 0, Math.max(8, readerAreaWidth - menuWidth - 8)),
    );
    const preferred = menuPosition?.y ?? 0;
    const y =
      readerAreaHeight > 0 && preferred + menuHeight > readerAreaHeight
        ? Math.max(8, preferred - menuHeight - 12)
        : preferred;
    return `left: ${x}px; top: ${y}px;`;
  }

  /** Документ области отображения или null. */
  function document(): Document | null {
    return frame?.contentDocument ?? null;
  }

  /** Сборка документа книги из глав. */
  function buildDocument(value: BookContent): string {
    const style = [
      'html{font-size:100%;}',
      "body{margin:0 auto;max-width:760px;padding:24px 32px;background:#fff;",
      "color:#1f2937;font-family:Georgia,'Times New Roman',serif;line-height:1.6;}",
      'img{max-width:100%;height:auto;}',
      'h1,h2,h3{line-height:1.25;}',
      'a{color:#4338ca;}',
      `.${NOTE_CLASS}{background:#fde68a;border-radius:2px;cursor:pointer;}`,
      `.${NOTE_CLASS}.${FLASH_CLASS}{background:#f59e0b;}`,
    ].join('');
    const body = value.chapters
      .map((chapter, index) => `<section class="texture-chapter" data-chapter="${index}">${chapter.html}</section>`)
      .join('\n');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
  }

  /** Раздел главы книги по индексу. */
  function chapterSection(index: number): Element | null {
    return document()?.querySelector(`.texture-chapter[data-chapter="${index}"]`) ?? null;
  }

  /** Снятие подсветок всех заметок без изменения текста. */
  function clearHighlights(): void {
    const value = document();
    if (!value) {
      return;
    }
    clearNoteMarks(value, `mark.${NOTE_CLASS}`);
  }

  /** Подсветка одной заметки; неподходящий якорь пропускается. */
  function highlightNote(note: Note): void {
    const value = document();
    const anchor = parseAnchor(note.anchor);
    if (!value || !anchor) {
      return;
    }
    const section = chapterSection(anchor.chapter);
    if (!section) {
      return;
    }
    highlightTextRange(section, anchor.start, anchor.end, NOTE_CLASS, note.id);
  }

  /** Перерисовка всех подсветок заметок. */
  function drawHighlights(): void {
    clearHighlights();
    for (const note of notes) {
      highlightNote(note);
    }
  }

  /** Переход к якорю заметки с показом выделения. */
  function gotoAnchor(note: Note): void {
    const value = document();
    if (!value) {
      return;
    }
    const root = value.scrollingElement ?? value.documentElement;
    const win = value.defaultView;
    const anchor = parseAnchor(note.anchor);
    const section = anchor ? chapterSection(anchor.chapter) : null;
    const range = anchor && section ? rangeFromOffsets(section, anchor.start, anchor.end) : null;
    const target = range ?? (section ? section : null);
    if (target && win && root) {
      const rect = target.getBoundingClientRect();
      win.scrollTo({ top: root.scrollTop + rect.top - 80, behavior: 'smooth' });
    } else if (anchor && anchor.percent > 0) {
      gotoPercent(anchor.percent);
    }
    const id = note.id;
    for (const mark of Array.from(value.querySelectorAll(`mark.${NOTE_CLASS}[data-note-id="${id}"]`))) {
      mark.classList.add(FLASH_CLASS);
      setTimeout(() => mark.classList.remove(FLASH_CLASS), 1200);
    }
  }

  /** Переход к доле позиции в книге. */
  function gotoPercent(percent: number): void {
    const value = document();
    const win = value?.defaultView;
    const root = value?.scrollingElement ?? value?.documentElement;
    if (!value || !win || !root) {
      return;
    }
    const max = root.scrollHeight - root.clientHeight;
    if (max > 0) {
      win.scrollTo({ top: max * (Math.max(0, Math.min(100, percent)) / 100), behavior: 'smooth' });
    }
  }

  /** Скрытие контекстного меню выделения и снятие выделения. */
  function dismissMenu(): void {
    pendingAnchor = null;
    menuPosition = null;
    document()?.getSelection()?.removeAllRanges();
  }

  /** Обработка выделения пользователя: подготовка меню создания заметки. */
  function handleMouseUp(): void {
    const value = document();
    const selection = value?.getSelection();
    if (!value || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      pendingAnchor = null;
      menuPosition = null;
      return;
    }
    const range = selection.getRangeAt(0);
    const element = (node: Node) =>
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const start = element(range.startContainer)?.closest('.texture-chapter');
    const end = element(range.endContainer)?.closest('.texture-chapter');
    if (!start || start !== end) {
      pendingAnchor = null;
      menuPosition = null;
      return;
    }
    const offsets = offsetsFromRange(start, range);
    const quote = range.toString().replace(/\s+/g, ' ').trim();
    if (!offsets || !quote) {
      pendingAnchor = null;
      menuPosition = null;
      return;
    }
    const rect = range.getBoundingClientRect();
    const win = value.defaultView;
    const root = value.scrollingElement ?? value.documentElement;
    const height = root?.scrollHeight ?? 0;
    const percent =
      win && root && height > 0
        ? Math.max(0, Math.min(100, ((rect.top + root.scrollTop) / height) * 100))
        : 0;
    const chapter = Number((start as HTMLElement).dataset.chapter ?? '0');
    pendingAnchor = createAnchor({
      chapter: Number.isFinite(chapter) ? chapter : 0,
      start: offsets.start,
      end: offsets.end,
      quote,
      percent,
      page: null,
    });
    const width = win?.innerWidth ?? 0;
    menuPosition = {
      x: Math.max(8, Math.min(rect.left, Math.max(8, width - 180))),
      y: Math.max(8, rect.bottom + 6),
    };  }

  /** Создание заметки-цитаты по текущему выделению. */
  function confirmQuote(): void {
    const anchor = pendingAnchor;
    dismissMenu();
    if (anchor) {
      onQuote?.(anchor);
    }
  }

  /** Обработка клика по подсветке: выбор заметки. */
  function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest?.(`mark.${NOTE_CLASS}`) as HTMLElement | null;
    if (mark?.dataset.noteId) {
      onSelectNote?.(mark.dataset.noteId);
    }
  }

  /** Отмена меню при начале нового взаимодействия с текстом. */
  function handleMouseDown(): void {
    if (pendingAnchor) {
      pendingAnchor = null;
      menuPosition = null;
    }
  }

  /** Отмена меню при снятии выделения (клик мимо, клавиатура, другая книга). */
  function handleSelectionChange(): void {
    if (!pendingAnchor) {
      return;
    }
    const selection = document()?.getSelection();
    if (!selection || selection.isCollapsed) {
      pendingAnchor = null;
      menuPosition = null;
    }
  }

  /** Захват опорной строки: читаемое место остаётся на экране при перестройке.
   *
   * Опорой служит живой диапазон второй видимой строки: пока строка живёт в
   * документе, её позиция восстанавливается точно — раньше браузерного reflow,
   * который смещал бы текст при изменении ширины или масштаба.
   */
  function captureAnchor(): void {
    const value = doc ?? document();
    if (!value) {
      return;
    }
    anchorRange = topAnchorRange(value);
    anchorTop = anchorRange ? anchorRange.getBoundingClientRect().top : 0;
  }

  /** Восстановление захваченной опорной строки после перестройки текста. */
  function restoreAnchor(): void {
    const value = doc ?? document();
    const root = value?.scrollingElement ?? value?.documentElement;
    if (!value || !root || !anchorRange) {
      return;
    }
    // Диапазон мог быть разрушен перерисовкой (например, подсветками).
    try {
      if (!value.body?.contains(anchorRange.startContainer)) {
        anchorRange = null;
        return;
      }
    } catch {
      anchorRange = null;
      return;
    }
    const delta = anchorRange.getBoundingClientRect().top - anchorTop;
    if (delta) {
      root.scrollTop += delta;
    }
  }

  /** Скрытие меню при прокрутке книги и обновление опорной строки. */
  function handleDocumentScroll(): void {
    if (pendingAnchor) {
      pendingAnchor = null;
      menuPosition = null;
    }
    handleScroll();
    captureAnchor();
  }

  /** Удержание читаемого места при изменении ширины области (например, панелью). */
  function handleResize(): void {
    restoreAnchor();
    handleScroll();
    captureAnchor();
  }

  /** Отчёт о позиции чтения при прокрутке. */
  function handleScroll(): void {
    if (!visible) {
      return;
    }
    const value = document();
    const root = value?.scrollingElement ?? value?.documentElement;
    if (!value || !root) {
      return;
    }
    const max = root.scrollHeight - root.clientHeight;
    onProgress?.(max > 0 ? (root.scrollTop / max) * 100 : 0);
  }

  /** Живая ссылка на опорную строку у верха области чтения.
   *
   * Возвращает диапазон, привязанный к символу во второй видимой строке. Пока
   * строка живёт в документе, её `getBoundingClientRect` остаётся точкой опоры
   * даже при перестройке текста, поэтому масштаб не сдвигает читаемое место.
   */
  function topAnchorRange(value: Document): Range | null {
    const win = value.defaultView;
    if (!win) {
      return null;
    }
    const x = Math.round(win.innerWidth / 2);
    const body = value.body ?? value.documentElement;
    const lineHeight = body ? parseFloat(win.getComputedStyle(body).lineHeight) || 24 : 24;
    const y = Math.round(ZOOM_ANCHOR_MARGIN + lineHeight);
    const caretRange = (
      value as Document & { caretRangeFromPoint?: (x: number, y: number) => Range | null }
    ).caretRangeFromPoint;
    if (typeof caretRange === 'function') {
      const range = caretRange.call(value, x, y);
      if (range) {
        return range;
      }
    }
    const caretPosition = (
      value as Document & {
        caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      }
    ).caretPositionFromPoint;
    if (typeof caretPosition === 'function') {
      const position = caretPosition.call(value, x, y);
      if (position) {
        const range = value.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.setEnd(position.offsetNode, position.offset);
        return range;
      }
    }
    return null;
  }

  /** Применение масштаба с удержанием опорной строки на месте. */
  function applyZoom(value: number): void {
    const current = document();
    const win = current?.defaultView;
    const root = current?.scrollingElement ?? current?.documentElement;
    if (!current || !win || !root) {
      return;
    }
    const anchor = topAnchorRange(current);
    const topBefore = anchor ? anchor.getBoundingClientRect().top : 0;
    current.documentElement.style.fontSize = `${value}%`;
    const topAfter = anchor ? anchor.getBoundingClientRect().top : 0;
    const delta = topAfter - topBefore;
    if (delta) {
      root.scrollTop += delta;
    }
  }

  /** Переход к заметке извне (панель заметок). */
  export function goto(note: Note): void {
    gotoAnchor(note);
  }

  /** Первичная настройка документа после загрузки области. */
  function handleLoad(): void {
    const value = document();
    doc = value;
    if (!value) {
      return;
    }
    value.addEventListener('mouseup', handleMouseUp);
    value.addEventListener('mousedown', handleMouseDown);
    value.addEventListener('click', handleClick);
    value.addEventListener('selectionchange', handleSelectionChange);
    value.addEventListener('scroll', handleDocumentScroll, { passive: true });
    value.defaultView?.addEventListener('resize', handleResize);
    applyZoom(zoom);
    if (startPosition > 0) {
      gotoPercent(startPosition);
    }
    drawHighlights();
    handleScroll();
    captureAnchor();
  }

  /** Документ книги собирается один раз при загрузке. */
  let html = $state('');
  onMount(() => {
    html = buildDocument(content);
  });

  /** Применение внешнего масштаба. */
  $effect(() => {
    const value = zoom;
    if (doc) {
      applyZoom(value);
      captureAnchor();
    }
  });

  /** Перерисовка подсветок при смене заметок. */
  $effect(() => {
    if (doc) {
      drawHighlights();
      captureAnchor();
    }
  });
</script>

<div
  class="relative h-full w-full"
  bind:clientWidth={readerAreaWidth}
  bind:clientHeight={readerAreaHeight}
>
  <iframe
    bind:this={frame}
    class="h-full w-full border-0 bg-white"
    title="Чтение книги"
    srcdoc={html}
    onload={handleLoad}
  ></iframe>

  {#if menuPosition && pendingAnchor}
    <div
      class="absolute z-10 flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-[4px] shadow-lg"
      data-testid="quote-menu"
      style={menuStyle()}
    >
      <Button variant="primary" size="sm" onclick={confirmQuote}>Создать заметку</Button>
      <Button variant="ghost" size="sm" onclick={dismissMenu}>Отмена</Button>
    </div>
  {/if}
</div>
