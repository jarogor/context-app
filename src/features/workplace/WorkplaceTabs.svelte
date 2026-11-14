<script lang="ts">
  import { t } from '@context/i18n';
    import { untrack } from 'svelte';
  import { ActionMenu, Button, Dialog, Icon, type MenuAction } from '@context/ui';
  import type { WorkspaceTab } from './workplace';
  import { openAvailability } from './workplace';
  import { logEvent } from '../../shared/app-log';
  import { clampWindowStart, visibleTabCount, windowStartForActive } from './tabs-window';
  import { tabColorFill, tabColorLine, tabIdleFill, tabLabel, tabTooltip } from './tab-appearance';
  import { NARROW_MAX_WIDTH } from '../../shared/breakpoints';
  import { hotkeyHint } from '../hotkeys/registry';

  interface Props {
    /** Вкладки рабочего места. */
    tabs: WorkspaceTab[];
    /** Активная вкладка. */
    activeTabId: string | null;
    /** Открыта ли панель списка открытых книг. */
    booksOpen: boolean;
    /** Открыта ли панель заметок. */
    notesOpen: boolean;
    /** Лимит числа открытых вкладок рабочего места. */
    openTabsLimit: number;
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
    /** Открыта ли панель свойств файла. */
    propertiesOpen?: boolean;
    /** Переключение панели свойств файла. */
    onToggleProperties?: () => void;
    /** Режим сосредоточенного чтения. */
    focusMode?: boolean;
    /** Переключение режима сосредоточенного чтения. */
    onToggleFocus?: () => void;
  }

  let {
    tabs,
    activeTabId,
    booksOpen,
    notesOpen,
    openTabsLimit,
    onSelect,
    onClose,
    onDuplicate,
    onAdd,
    onAddFile,
    onToggleBooks,
    onToggleNotes,
    propertiesOpen = false,
    onToggleProperties,
    focusMode = false,
    onToggleFocus,
  }: Props = $props();

  /** Доступность создания новых вкладок при текущем лимите. */
  const availability = $derived(openAvailability(tabs.length, openTabsLimit));

  /** Открытие новых вкладок заблокировано: лимит достигнут или превышен. */
  const openBlocked = $derived(availability !== 'available');

  /** Лимит превышен: вкладок больше, чем разрешено. */
  const overLimit = $derived(availability === 'over-limit');

  /** Краткая подсказка заблокированным кнопкам открытия. */
  const openBlockedTitle = $derived(
    overLimit ? t('app.workplace.limitExceeded') : t('app.workplace.limitReached'),
  );

  /** Подсказка кнопке открытия: краткая при блокировке, обычная иначе. */
  function openButtonTitle(base: string): string {
    return openBlocked ? openBlockedTitle : base;
  }

  /** Признак того, что о превышении лимита уже сообщено (для дедупликации). */
  let overLimitReported = false;

  /** Запись пояснения о превышении лимита в журнал с дедупликацией. */
  $effect(() => {
    if (!overLimit) {
      overLimitReported = false;
      return;
    }
    if (overLimitReported) {
      return;
    }
    overLimitReported = true;
    void logEvent({
      message: t('app.workplace.limitExceededMessage', {
        opened: tabs.length,
        limit: openTabsLimit,
      }),
      severity: 'warn',
      source: 'workplace',
      details: { tabs: tabs.length, limit: openTabsLimit },
    }).catch(() => undefined);
  });

  /** Промежуток между вкладками в пикселях (класс `gap-[0.125rem]`). */
  const TAB_GAP_PX = 2;

  /**
   * Высота вкладки в rem — та же, что у иконочных кнопок полосы.
   *
   * Вкладка стоит в одном ряду с кнопками и не должна быть ниже: иначе полоса
   * выглядит рваной. Значение повторяет `size-9` кнопки (`2.25rem`) и её
   * сенсорную высоту `pointer-coarse:size-11` (`2.75rem`).
   */
  const TAB_ROW_REM = 2.25;

  /** Высота вкладки на сенсорном указателе. */
  const TAB_ROW_TOUCH_REM = 2.75;

  /** Ширина вкладки в rem. */
  const TAB_WIDTH_REM = 9;

  /** Кегль корневого элемента по умолчанию, если его не удаётся прочитать. */
  const FALLBACK_ROOT_FONT_PX = 16;

  /** Ширина списка вкладок; измеряется наблюдателем размера. */
  let listWidth = $state(0);

  /** Фактическая ширина вкладки в пикселях (следует за масштабом). */
  let tabWidthPx = $state(TAB_WIDTH_REM * FALLBACK_ROOT_FONT_PX);

  /** Начало видимого окна вкладок. */
  let windowStart = $state(0);

  /** Узкое окно (телефон, планшет): показывается одна активная вкладка. */
  let compactTabs = $state(false);


  /** Слежение за телефонной шириной: на ней полоса вкладок не листается. */
  $effect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const query = window.matchMedia(NARROW_MAX_WIDTH);
    compactTabs = query.matches;
    const onChange = (event: MediaQueryListEvent) => {
      compactTabs = event.matches;
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  });

  /**
   * Пункты меню вкладки на узком окне.
   *
   * В полосе видна одна вкладка, поэтому её собственные действия собраны в
   * меню: отдельные кнопки занимали бы почти всё место подписи.
   */
  const compactTabActions = $derived<MenuAction[]>([
    {
      id: 'duplicate',
      label: t('app.workplace.tab.duplicate'),
      icon: 'duplicate',
      disabled: openBlocked,
    },
    {
      id: 'close',
      label: t('app.workplace.tab.close'),
      icon: 'close',
      // Закрытие необратимо: значок предупреждает цветом опасности.
      dangerIcon: true,
    },
  ]);

  /** Выполнение пункта меню вкладки. */
  function runCompactTabAction(id: string, tabId: string) {
    switch (id) {
      case 'duplicate':
        onDuplicate(tabId);
        break;
      case 'close':
        askCloseTab(tabId);
        break;
    }
  }

  /**
   * Пункты меню панелей и открытия книги на узком окне.
   *
   * В полосе видна одна вкладка, и кнопки панелей, добавления книги и открытия
   * файла уезжают сюда целиком: рядом с вкладкой для них нет места.
   */
  const compactPanelActions = $derived<MenuAction[]>([
    {
      id: 'books',
      label: t('app.workplace.tabs'),
      icon: 'tabs',
    },
    {
      id: 'notes',
      label: t('app.workplace.notes'),
      icon: 'note',
    },
    {
      id: 'properties',
      label: t('app.workplace.properties'),
      icon: 'layers',
    },
    {
      id: 'add-book',
      label: t('app.workplace.addBook'),
      icon: 'plus',
      separatorBefore: true,
      disabled: openBlocked,
    },
    {
      id: 'add-file',
      label: t('app.workplace.addFile'),
      icon: 'folder',
      disabled: openBlocked,
    },
  ]);

  /** Выполнение пункта меню панелей и открытия книги. */
  function runCompactPanelAction(id: string) {
    switch (id) {
      case 'books':
        onToggleBooks();
        break;
      case 'notes':
        onToggleNotes();
        break;
      case 'properties':
        onToggleProperties?.();
        break;
      case 'add-book':
        onAdd();
        break;
      case 'add-file':
        onAddFile();
        break;
    }
  }

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
   * На узком окне окно вмещает одну вкладку — активную: остальные доступны в
   * панели вкладок, а не листанием полосы.
   */
  const capacity = $derived(compactTabs ? 1 : visibleTabCount(listWidth, tabWidthPx + TAB_GAP_PX));

  /** Помещаются ли все вкладки; иначе показываются навигация и счётчик.
   *
   * На узком окне навигация по вкладкам не нужна: видна одна активная вкладка.
   */
  const overflowing = $derived(!compactTabs && tabs.length > capacity);

  /** Начало окна, удержанное в допустимых границах. */
  const safeStart = $derived(clampWindowStart(windowStart, capacity, tabs.length));

  /** Видимый срез вкладок.
   *
   * На узком окне показывается только активная вкладка: состав места целиком
   * живёт в панели вкладок, а полоса не прокручивается и не считает диапазон.
   */
  const windowTabs = $derived(
    compactTabs
      ? tabs.filter((tab) => tab.id === activeTabId).slice(0, 1)
      : tabs.slice(safeStart, safeStart + capacity),
  );

  /**
   * Вкладки занимают всю ширину окна.
   *
   * Когда листать нечего, срез не должен жаться к левому краю: вкладки делят
   * доступное место поровну и растягиваются на всю полосу. На узком окне так
   * же растягивается единственная активная вкладка.
   */
  const stretched = $derived(windowTabs.length <= capacity);

  /** Номер вкладки в составе рабочего места (с единицы) по её идентификатору.
   *
   * Нумерация одна на полосу и на панель списка: номер — это место вкладки в
   * составе места, а не в видимом срезе полосы. Поэтому при листании и поиске
   * номера не «переезжают», и вкладку в полосе можно найти по номеру из списка.
   */
  const tabNumbers = $derived(new Map(tabs.map((tab, index) => [tab.id, index + 1])));

  /** Номер первой видимой вкладки (с единицы). */
  const rangeFrom = $derived(safeStart + 1);

  /** Номер последней видимой вкладки (с единицы). */
  const rangeTo = $derived(Math.min(safeStart + capacity, tabs.length));

  /** Подсказка счётчика видимого диапазона. */
  const rangeTitle = $derived(
    t('app.workplace.rangeTitle', { from: rangeFrom, to: rangeTo, total: tabs.length }),
  );

  /** Слежение за шириной списка вкладок и масштабом интерфейса. */
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

  /** Вкладка, закрытие которой ждёт подтверждения; `null` — диалог закрыт. */
  let closingTabId: string | null = $state(null);

  /** Кнопка закрытия открывает подтверждение, а не закрывает вкладку сразу. */
  function askCloseTab(id: string) {
    closingTabId = id;
  }

  /** Подтверждение закрытия запомненной вкладки. */
  function confirmCloseTab() {
    const id = closingTabId;
    closingTabId = null;
    if (id !== null) {
      onClose(id);
    }
  }

  /** Отмена подтверждения: состав вкладок и активная вкладка не меняются. */
  function cancelCloseTab() {
    closingTabId = null;
  }

  /** Подпись вкладки в подтверждении: её имя или название книги. */
  const closingTabLabel = $derived.by(() => {
    const tab = tabs.find((item) => item.id === closingTabId);
    return tab ? tabLabel(tab) : '';
  });

  /** Фрагмент стиля вкладки: заливка и обводка пользовательским цветом.
   *
   * У вкладки без цвета фон задаётся классом (`--tab-idle-surface`), поэтому
   * переменная не нужна. У цветной: неактивная залита слабым оттенком цвета
   * поверх общего фона неактивной вкладки, активная — плотнее; обводку получает
   * только активная, как и нецветная: у неактивных контура нет ни у кого.
   */
  function tabFill(tab: WorkspaceTab): string {
    const base = tabIdleFill(tab.color);
    const active = tabColorFill(tab.color, 'var(--muted)', true);
    const line = tabColorLine(tab.color, true);
    return base && active && line
      ? ` --tab-fill: ${base}; --tab-fill-active: ${active}; --tab-line: ${line};`
      : '';
  }

  /** Классы фона вкладки с учётом пользовательского цвета и активности.
   *
   * Вкладки — самостоятельные плашки на полосе: скруглены со всех сторон, не
   * «стоят» на нижней границе. Активная вкладка оформлена как активный пункт
   * раздела в шапке: плотная акцентная заливка `--primary` и светлый текст
   * `--primary-foreground`, поэтому выделение в интерфейсе читается одинаково и
   * не зависит от того, насколько тёмен фон палитры. Цветная активная залита
   * своим приглушённым цветом. Фон неактивной общий для всех
   * (`--tab-idle-surface`), цветная неактивная — сверх него мягким оттенком
   * своего цвета. Наведение — прежнее.
   *
   * Подпись цветной вкладки остаётся цветом основного текста: приглушённая
   * заливка светлая, и вторичный цвет на ней сливался с фоном. Цветная обводка
   * рисуется внутренней тенью: рамка добавила бы размер и сдвинула бы вкладки
   * на полосе.
   */
  function tabFillClass(tab: WorkspaceTab): string {
    const active = tab.id === activeTabId;
    if (tab.color) {
      return active
        ? 'bg-[var(--tab-fill-active)] text-[var(--foreground)] shadow-[inset_0_0_0_1px_var(--tab-line)]'
        : 'bg-[var(--tab-fill)] text-[var(--foreground)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)]';
    }
    return active
      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
      : 'bg-[var(--tab-idle-surface)] text-[var(--muted-foreground)] hover:bg-[var(--primary)] hover:text-[var(--primary-foreground)]';
  }

  /** Пункты контекстного меню рабочего места на телефоне. */
</script>

<div
  class="flex flex-none items-center gap-2 overflow-hidden bg-[var(--muted)] px-2 py-1.5"
  data-testid="workplace-tabs"
>
  <!--
    Кнопки «К списку рабочих мест» здесь нет: к списку возвращает кнопка раздела
    в верхней панели, и вторая точка входа только дублировала бы её.
  -->
  <!--
    Панели вкладок, заметок и свойств открываются слева, рядом с содержимым
    места. На узком окне их кнопки заменены меню там же, слева от вкладки.
  -->
  {#if !compactTabs}
    <div class="flex flex-none items-center gap-[0.125rem]" data-testid="workplace-tabs-panels">
      <!--
        На узком окне эта группа заменена меню слева от вкладки: там кнопок
        панелей нет, а действия те же и живут в меню.
      -->
      <Button
        variant={booksOpen ? 'primary' : 'ghost'}
        size="icon"
        title={hotkeyHint('workplace.books', t('app.workplace.tabs'))}
        ariaLabel={t('app.workplace.tabs')}
        ariaPressed={booksOpen}
        onclick={onToggleBooks}
      >
        <Icon name="tabs" />
      </Button>
      <Button
        variant={notesOpen ? 'primary' : 'ghost'}
        size="icon"
        title={hotkeyHint('workplace.notes', t('app.workplace.notes'))}
        ariaLabel={t('app.workplace.notes')}
        testId="workplace-notes-toggle"
        ariaPressed={notesOpen}
        onclick={onToggleNotes}
      >
        <Icon name="note" />
      </Button>
      <!--
        Свойства файла — содержание, закладки, страницы и встроенные пометки.
        Кнопка стоит рядом с заметками: это второй способ увидеть книгу, кроме
        её текста, и он тоже относится к открытой книге.
      -->
      <Button
        variant={propertiesOpen ? 'primary' : 'ghost'}
        size="icon"
        title={hotkeyHint('workplace.properties', t('app.workplace.properties'))}
        ariaLabel={t('app.workplace.properties')}
        testId="workplace-properties-toggle"
        ariaPressed={propertiesOpen}
        onclick={onToggleProperties}
      >
        <Icon name="layers" />
      </Button>
    </div>
  {/if}
  <div class="flex min-w-0 flex-1 items-center gap-2">
    {#if compactTabs}
      <!--
        Меню панелей стоит слева от вкладки — там же, где были кнопки панелей.
        В нём три панели, затем открытие книги отдельной группой.
      -->
      <span class="flex">
        <ActionMenu
          items={compactPanelActions}
          onselect={runCompactPanelAction}
          ariaLabel={t('app.workplace.panelActions')}
          title={t('app.workplace.panelActions')}
          testId="workplace-panel-menu"
        />
      </span>
    {/if}
    {#if overflowing}
      <Button
        size="icon"
        variant="ghost"
        title={t('app.workplace.prevTabs')}
        ariaLabel={t('app.workplace.prevTabs')}
        disabled={safeStart === 0}
        onclick={() => shiftWindow(-1)}
      >
        <Icon name="chevron-left" />
      </Button>
    {/if}
    <div
      class="flex min-w-0 flex-1 items-center gap-[0.125rem] overflow-hidden"
      bind:this={listEl}
      data-testid="workplace-tabs-window"
    >
      {#each windowTabs as tab (tab.id)}
        <div
          class="relative flex items-center overflow-hidden rounded-[var(--radius)] {stretched
            ? 'min-w-0 flex-1'
            : 'flex-none'} {tabFillClass(tab)} h-[var(--tab-height)] pointer-coarse:h-[var(--tab-height-touch)]"
          style="{stretched
            ? ''
            : `width: ${TAB_WIDTH_REM}rem;`}--tab-height: {TAB_ROW_REM}rem; --tab-height-touch: {TAB_ROW_TOUCH_REM}rem;{tabFill(
            tab,
          )}"
          data-testid="workplace-tab-item"
        >
          <!--
            Номер вкладки — её место в составе рабочего места, тот же, что в
            панели списка. Стоит перед кнопкой, чтобы не попадать в её подпись:
            подпись вкладки — только название.
          -->
          <span
            class="shrink-0 pl-2 text-[0.7em] tabular-nums opacity-60"
            data-testid="workplace-tab-number"
            >{tabNumbers.get(tab.id) ?? ''}</span
          >
          <button
            type="button"
            data-testid="workplace-tab"
            class="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 truncate py-[0.25rem] pl-1.5 text-left role-caption [font:inherit]"
            aria-pressed={tab.id === activeTabId}
            title={tabTooltip(tab)}
            onclick={() => selectTab(tab.id)}
          >
            {#if tab.icon}
              <Icon name={tab.icon} class="h-3 w-3 shrink-0" />
            {/if}
            <span class="min-w-0 flex-1 truncate">{tabLabel(tab)}</span>
          </button>
          {#if compactTabs}
            <!--
              На телефоне и планшете у единственной видимой вкладки отдельные
              кнопки занимали бы почти всё место. Поэтому дублирование,
              закрытие и открытие книги собраны в одно меню.
            -->
            <!--
              Кнопка 1.75rem в полосе 2.25rem: сверху и снизу по 0.25rem, значит
              и справа столько же — отступ одинаков со всех сторон.
            -->
            <span class="flex pr-1">
              <ActionMenu
                items={compactTabActions}
                onselect={(id) => runCompactTabAction(id, tab.id)}
                ariaLabel={t('app.workplace.tab.actions')}
                title={t('app.workplace.tab.actions')}
                testId="workplace-tab-menu"
                plain
                class="size-7"
              />
            </span>
          {:else}
            <span class="flex" title={openButtonTitle(t('app.workplace.tab.duplicate'))}>
              <button
                type="button"
                aria-label={t('app.workplace.tab.duplicate')}
                disabled={openBlocked}
                class="flex-none cursor-pointer px-[0.1875rem] opacity-60 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40 {overLimit
                  ? 'text-destructive'
                  : ''}"
                onclick={() => onDuplicate(tab.id)}
              >
                <Icon name="duplicate" class="h-[0.85em] w-[0.85em]" />
              </button>
            </span>
            <button
              type="button"
              data-testid="workplace-tab-close"
              title={t('app.workplace.tab.close')}
              aria-label={t('app.workplace.tab.close')}
              class="flex-none cursor-pointer px-[0.1875rem] pr-2 opacity-60 hover:opacity-100"
              onclick={() => askCloseTab(tab.id)}
            >
              <Icon name="close" class="h-[0.85em] w-[0.85em]" />
            </button>
          {/if}
        </div>
      {/each}
    </div>
    {#if overflowing}
      <span
        class="flex-none self-center whitespace-nowrap role-caption text-[var(--muted-foreground)]"
        data-testid="workplace-tabs-counter"
        title={rangeTitle}
      >
        {t('app.workplace.range', { from: rangeFrom, to: rangeTo, total: tabs.length })}
      </span>
      <Button
        size="icon"
        variant="ghost"
        title={t('app.workplace.nextTabs')}
        ariaLabel={t('app.workplace.nextTabs')}
        disabled={safeStart + capacity >= tabs.length}
        onclick={() => shiftWindow(1)}
      >
        <Icon name="chevron-right" />
      </Button>
    {/if}
  </div>
  <!--
    Справа — действия над книгой: добавить, открыть файл, а за ними —
    сосредоточенное чтение. Панели слева, действия книги справа: окно вкладок
    разделяет группы само, без черты между ними.
  -->
  {#if !compactTabs}
    <div class="flex flex-none items-center gap-[0.125rem]" data-testid="workplace-tabs-actions">
      <span class="flex" title={openButtonTitle(t('app.workplace.addBook'))}>
        <Button
          size="icon"
          variant={overLimit ? 'ghost-danger' : 'ghost'}
          ariaLabel={t('app.workplace.addBook')}
          disabled={openBlocked}
          onclick={onAdd}
        >
          <Icon name="plus" />
        </Button>
      </span>
      <span
        class="flex"
        title={openButtonTitle(hotkeyHint('workplace.add.book', t('app.workplace.addFile')))}
      >
        <Button
          size="icon"
          variant={overLimit ? 'ghost-danger' : 'ghost'}
          ariaLabel={t('app.workplace.addFile')}
          disabled={openBlocked}
          onclick={onAddFile}
        >
          <Icon name="folder" />
        </Button>
      </span>
    </div>
  {/if}
  {#if onToggleFocus}
    <Button
      variant={focusMode ? 'primary' : 'ghost'}
      size="icon"
      title={hotkeyHint(
        'workplace.focus',
        focusMode ? t('app.workplace.focusExit') : t('app.workplace.focus'),
      )}
      ariaLabel={focusMode ? t('app.workplace.focusExit') : t('app.workplace.focus')}
      ariaPressed={focusMode}
      testId="workplace-focus-toggle"
      onclick={onToggleFocus}
    >
      <Icon name="focus" />
    </Button>
  {/if}
</div>

<Dialog
  open={closingTabId !== null}
  title={t('app.workplace.tab.closeConfirm')}
  showClose={false}
  onOpenChange={(value) => {
    if (!value) {
      cancelCloseTab();
    }
  }}
>
  <p class="role-body text-[var(--muted-foreground)]" data-testid="workplace-tab-close-question">
    {closingTabLabel}
  </p>
  <div class="flex justify-end gap-2">
    <Button variant="secondary" onclick={cancelCloseTab}>{t('app.workplace.tab.closeNo')}</Button>
    <Button variant="primary" onclick={confirmCloseTab}>{t('app.workplace.tab.closeYes')}</Button>
  </div>
</Dialog>
