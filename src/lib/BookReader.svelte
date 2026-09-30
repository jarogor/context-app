<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import type { BookContent } from './reader';
  import type { Note } from './notes';
  import {
    createAnchor,
    offsetsFromRange,
    parseAnchor,
    rangeFromOffsets,
    type QuoteAnchor,
  } from './reader/anchor';

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

  /** Область отображения книги. */
  let frame: HTMLIFrameElement | undefined = $state();
  /** Документ книги после загрузки области. */
  let doc: Document | null = $state(null);
  /** Начальная позиция, взятая один раз при создании вкладки. */
  const startPosition = untrack(() => initialPosition);

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
    for (const mark of Array.from(value.querySelectorAll(`mark.${NOTE_CLASS}`))) {
      const parent = mark.parentNode;
      if (!parent) {
        continue;
      }
      while (mark.firstChild) {
        parent.insertBefore(mark.firstChild, mark);
      }
      parent.removeChild(mark);
    }
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
    const range = rangeFromOffsets(section, anchor.start, anchor.end);
    if (!range) {
      return;
    }
    const mark = value.createElement('mark');
    mark.className = NOTE_CLASS;
    mark.dataset.noteId = note.id;
    try {
      range.surroundContents(mark);
    } catch {
      const fragment = range.extractContents();
      mark.appendChild(fragment);
      range.insertNode(mark);
    }
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

  /** Обработка выделения пользователя: цитата и её место. */
  function handleMouseUp(): void {
    const value = document();
    const selection = value?.getSelection();
    if (!value || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return;
    }
    const range = selection.getRangeAt(0);
    const element = (node: Node) =>
      node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    const start = element(range.startContainer)?.closest('.texture-chapter');
    const end = element(range.endContainer)?.closest('.texture-chapter');
    if (!start || start !== end) {
      return;
    }
    const offsets = offsetsFromRange(start, range);
    const quote = range.toString().replace(/\s+/g, ' ').trim();
    if (!offsets || !quote) {
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
    selection.removeAllRanges();
    onQuote?.(
      createAnchor({
        chapter: Number.isFinite(chapter) ? chapter : 0,
        start: offsets.start,
        end: offsets.end,
        quote,
        percent,
        page: null,
      }),
    );
  }

  /** Обработка клика по подсветке: выбор заметки. */
  function handleClick(event: MouseEvent): void {
    const target = event.target as HTMLElement | null;
    const mark = target?.closest?.(`mark.${NOTE_CLASS}`) as HTMLElement | null;
    if (mark?.dataset.noteId) {
      onSelectNote?.(mark.dataset.noteId);
    }
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

  /** Применение масштаба с удержанием верхней строки. */
  function applyZoom(value: number): void {
    const current = document();
    const win = current?.defaultView;
    const root = current?.scrollingElement ?? current?.documentElement;
    if (!current || !win || !root) {
      return;
    }
    const width = win.innerWidth;
    const before =
      typeof current.elementFromPoint === 'function'
        ? current.elementFromPoint(Math.round(width / 2), 30)
        : null;
    const topBefore = before?.getBoundingClientRect().top ?? 0;
    current.documentElement.style.fontSize = `${value}%`;
    const topAfter = before?.getBoundingClientRect().top ?? 0;
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
    value.addEventListener('click', handleClick);
    value.addEventListener('scroll', handleScroll, { passive: true });
    value.defaultView?.addEventListener('resize', handleScroll);
    applyZoom(zoom);
    if (startPosition > 0) {
      gotoPercent(startPosition);
    }
    drawHighlights();
    handleScroll();
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
    }
  });

  /** Перерисовка подсветок при смене заметок. */
  $effect(() => {
    if (doc) {
      drawHighlights();
    }
  });
</script>

<iframe
  bind:this={frame}
  class="h-full w-full border-0 bg-white"
  title="Чтение книги"
  srcdoc={html}
  onload={handleLoad}
></iframe>
