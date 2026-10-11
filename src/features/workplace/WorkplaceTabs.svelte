<script lang="ts">
  import { untrack } from 'svelte';
  import { Button } from '@texture/ui';
  import type { WorkspaceTab } from './workplace';
  import { clampWindowStart, visibleTabCount, windowStartForActive } from './tabs-window';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Открыта ли панель списка открытых книг. */
    booksOpen: boolean;
    /** Открыта ли панель заметок. */
    notesOpen: boolean;
    /** Выбор вкладки. */
    onSelect: (id: string) => void;
    /** Закрытие вкладки. */
    onClose: (id: string) => void;
    /** Дублирование вкладки. */
    onDuplicate: (id: string) => void;
    /** Добавление книги (переход в библиотеку). */
    onAdd: () => void;
    /** Открытие книги с диска как произвольного файла. */
    onAddFile: () => void;
    /** Переключение панели открытых книг. */
    onToggleBooks: () => void;
    /** Переключение панели заметок. */
    onToggleNotes: () => void;
    /** Возврат к списку рабочих мест. */
    onBackToList: () => void;
  }

  let {
    tabs,
    activeTabId,
    booksOpen,
    notesOpen,
    onSelect,
    onClose,
    onDuplicate,
    onAdd,
    onAddFile,
    onToggleBooks,
    onToggleNotes,
    onBackToList,
  }: Props = $props();

  /** Промежуток между вкладками в пикселях (класс `gap-[2px]`). */
  const TAB_GAP_PX = 2;

  /** Высота и ширина вкладки в rem: весь элемент вместе с кнопками действий. */
  const TAB_ROW_REM = 1.6;

  /** Ширина вкладки в rem. */
  const TAB_WIDTH_REM = 7.5;

  /** Кегль корневого элемента по умолчанию, если его не удаётся прочитать. */
  const FALLBACK_ROOT_FONT_PX = 16;

  /** Ширина списка вкладок; измеряется наблюдателем размера. */
  let listWidth = $state(0);

  /** Фактическая ширина вкладки в пикселях (следует за масштабом). */
  let tabWidthPx = $state(TAB_WIDTH_REM * FALLBACK_ROOT_FONT_PX);

  /** Начало видимого окна вкладок. */
  let windowStart = $state(0);

  /** Элемент списка вкладок для измерения ширины. */
  let listEl: HTMLDivElement | undefined = $state();

  /** Ширина одной вкладки в пикселях по текущему масштабу интерфейса. */
  function measureTabWidth(): number {
    if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') {
      return TAB_WIDTH_REM * FALLBACK_ROOT_FONT_PX;
    }
    const rootFont = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
    const base = Number.isFinite(rootFont) && rootFont > 0 ? rootFont : FALLBACK_ROOT_FONT_PX;
    return TAB_WIDTH_REM * base;
  }

  /** Ёмкость окна: сколько вкладок целиком видно в ширине списка.
   *
   * Навигация и счётчик стоят вне измеряемого списка, поэтому их место уже
   * вычтено из ширины списка раскладкой — отдельный запас не нужен.
   */
  const capacity = $derived(visibleTabCount(listWidth, tabWidthPx + TAB_GAP_PX));

  /** Помещаются ли все вкладки; иначе показываются навигация и счётчик. */
  const overflowing = $derived(tabs.length > capacity);

  /** Начало окна, удержанное в допустимых границах. */
  const safeStart = $derived(clampWindowStart(windowStart, capacity, tabs.length));

  /** Видимый срез вкладок. */
  const windowTabs = $derived(tabs.slice(safeStart, safeStart + capacity));

  /** Номер первой видимой вкладки (с единицы). */
  const rangeFrom = $derived(safeStart + 1);

  /** Номер последней видимой вкладки (с единицы). */
  const rangeTo = $derived(Math.min(safeStart + capacity, tabs.length));

  /** Подсказка счётчика видимого диапазона. */
  const rangeTitle = $derived(`Показаны вкладки ${rangeFrom}–${rangeTo} из ${tabs.length}`);

  /** Слежение за шириной списка вкладок и масштабом интерфейса.
   *
   * Первое измерение выполняется сразу, повторные — в кадре отрисовки, а
   * состояние обновляется только при фактическом изменении значений: иначе
   * запись состояния из обратного вызова наблюдателя вызывает новый цикл
   * пересчёта размеров и предупреждение о незавершённом цикле.
   */
  $effect(() => {
    const el = listEl;
    if (!el) {
      return;
    }
    let frame = 0;
    let lastWidth = -1;
    let lastTab = -1;
    const apply = () => {
      const width = el.clientWidth;
      const tab = measureTabWidth();
      if (width !== lastWidth) {
        lastWidth = width;
        untrack(() => {
          listWidth = width;
        });
      }
      if (tab !== lastTab) {
        lastTab = tab;
        untrack(() => {
          tabWidthPx = tab;
        });
      }
    };
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(apply);
    };
    apply();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  });

  /** Показ активной вкладки: при её смене окно сдвигается так, чтобы она была видна. */
  $effect(() => {
    const index = tabs.findIndex((tab) => tab.id === activeTabId);
    const cap = capacity;
    const start = untrack(() => windowStart);
    windowStart = windowStartForActive(index, start, cap, tabs.length);
  });

  /** Сдвиг окна вкладок на одну позицию в пределах списка. */
  function shiftWindow(delta: number) {
    windowStart = clampWindowStart(safeStart + delta, capacity, tabs.length);
  }

  /** Выбор вкладки с показом её в окне. */
  function selectTab(id: string) {
    const index = tabs.findIndex((tab) => tab.id === id);
    windowStart = windowStartForActive(index, safeStart, capacity, tabs.length);
    onSelect(id);
  }
</script>

<div
  class="flex flex-none items-center gap-2 overflow-hidden bg-[var(--muted)] px-2 py-1"
  data-testid="workplace-tabs"
>
  <Button
    size="icon"
    variant="secondary"
    title="К списку рабочих мест"
    ariaLabel="К списку рабочих мест"
    onclick={onBackToList}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M15 6l-6 6 6 6"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </Button>
  <span class="text-[var(--input)]" aria-hidden="true">|</span>
  <!-- Действия открытия книги закреплены вне окна вкладок: переполнение не
       выталкивает их за пределы панели. -->
  <div class="flex flex-none items-center gap-[2px]" data-testid="workplace-tabs-actions">
    <Button size="icon" variant="ghost" title="Добавить книгу" ariaLabel="Добавить книгу" onclick={onAdd}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </Button>
    <Button
      size="icon"
      variant="ghost"
      title="Открыть файл с диска"
      ariaLabel="Открыть файл с диска"
      onclick={onAddFile}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4l2 2.5h7A1.5 1.5 0 0 1 19 9v8.5A1.5 1.5 0 0 1 17.5 19h-13A1.5 1.5 0 0 1 3 17.5Z"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
      </svg>
    </Button>
  </div>
  <div class="flex min-w-0 flex-1 items-center gap-2">
    {#if overflowing}
      <Button
        size="icon"
        variant="ghost"
        title="Предыдущие вкладки"
        ariaLabel="Предыдущие вкладки"
        disabled={safeStart === 0}
        onclick={() => shiftWindow(-1)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M15 6l-6 6 6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </Button>
    {/if}
    <div
      class="flex min-w-0 flex-1 items-center gap-[2px] overflow-hidden"
      bind:this={listEl}
      data-testid="workplace-tabs-window"
    >
      {#each windowTabs as tab (tab.id)}
        <div
          class="flex flex-none items-center rounded-md {tab.id === activeTabId
            ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
            : 'text-[var(--muted-foreground)] hover:bg-[var(--background)]'}"
          style="width: {TAB_WIDTH_REM}rem; height: {TAB_ROW_REM}rem"
          data-testid="workplace-tab-item"
        >
          <button
            type="button"
            data-testid="workplace-tab"
            class="min-w-0 flex-1 cursor-pointer truncate py-[2px] pl-2 text-left text-[0.7rem] [font:inherit]"
            aria-pressed={tab.id === activeTabId}
            title={tab.title}
            onclick={() => selectTab(tab.id)}
          >
            {tab.title}
          </button>
          <button
            type="button"
            title="Дублировать вкладку"
            aria-label="Дублировать вкладку"
            class="flex-none cursor-pointer px-[3px] opacity-70 hover:opacity-100"
            onclick={() => onDuplicate(tab.id)}
          >
            <svg viewBox="0 0 24 24" width="0.85em" height="0.85em" aria-hidden="true">
              <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M5 15V6a2 2 0 0 1 2-2h9" fill="none" stroke="currentColor" stroke-width="2" />
            </svg>
          </button>
          <button
            type="button"
            data-testid="workplace-tab-close"
            title="Закрыть вкладку"
            aria-label="Закрыть вкладку"
            class="flex-none cursor-pointer px-[3px] pr-2 opacity-70 hover:opacity-100"
            onclick={() => onClose(tab.id)}
          >
            <svg viewBox="0 0 24 24" width="0.85em" height="0.85em" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </button>
        </div>
      {/each}
    </div>
    {#if overflowing}
      <span
        class="flex-none whitespace-nowrap text-[0.7rem] text-[var(--muted-foreground)]"
        data-testid="workplace-tabs-counter"
        title={rangeTitle}
      >
        {rangeFrom}–{rangeTo} из {tabs.length}
      </span>
      <Button
        size="icon"
        variant="ghost"
        title="Следующие вкладки"
        ariaLabel="Следующие вкладки"
        disabled={safeStart + capacity >= tabs.length}
        onclick={() => shiftWindow(1)}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path
            d="M9 6l6 6-6 6"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </Button>
    {/if}
  </div>
  <Button
    variant={notesOpen ? 'primary' : 'secondary'}
    size="icon"
    title="Заметки"
    ariaLabel="Заметки"
    ariaPressed={notesOpen}
    onclick={onToggleNotes}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path
        d="M6 3.5h9.5L20 8v12.5H6Z"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linejoin="round"
      />
      <path d="M15.5 3.5V8H20" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="M9 12h7M9 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </Button>
  <Button
    variant={booksOpen ? 'primary' : 'secondary'}
    size="icon"
    title="Открытые книги"
    ariaLabel="Открытые книги"
    ariaPressed={booksOpen}
    onclick={onToggleBooks}
  >
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
  </Button>
</div>
