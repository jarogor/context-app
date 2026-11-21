<script lang="ts">
  import { t } from '@context/i18n';
  import { Button, ColorPicker, Icon, Popover, type ColorSwatch } from '@context/ui';
  import type { WorkspaceTab } from './workplace';
  import { tabColorMark, tabLabel, tabTooltip } from './tab-appearance';
  import { hotkeyHint } from '../hotkeys/registry';
  import {
    NOTE_COLORS,
    NOTE_COLOR_SWATCHES,
    NOTE_TYPES,
    noteColorLabel,
    noteTypeLabel,
    SHAPE_KINDS,
    shapeKindLabel,
    type NoteColor,
    type NoteTool,
    type NoteType,
    type ShapeKind,
  } from '../notes/notes';

  interface Props {
    /** Вкладки рабочего места: по ним считается доступность добавления. */
    tabs: WorkspaceTab[];
    /** Активная вкладка; `null` — открытых книг нет. */
    activeTabId: string | null;
    /** Открыта ли панель списка вкладок. */
    booksOpen: boolean;
    /** Открыта ли панель заметок. */
    notesOpen: boolean;
    /** Открыта ли панель свойств книги. */
    propertiesOpen: boolean;
    /** Режим сосредоточенного чтения. */
    focusMode?: boolean;
    /** Переключение панели списка вкладок. */
    onToggleBooks: () => void;
    /** Переключение панели заметок. */
    onToggleNotes: () => void;
    /** Переключение панели свойств книги. */
    onToggleProperties: () => void;
    /** Переключение режима сосредоточенного чтения. */
    onToggleFocus?: () => void;
    /** Применима ли гарнитура книги: у постраничных форматов текст — растр. */
    fontAvailable?: boolean;
    /** Текущая гарнитура книги. */
    readerFont?: 'serif' | 'sans';
    /** Переключение гарнитуры книги. */
    onToggleFont?: () => void;
    /** Открыта ли панель поиска по книге. */
    searchOpen?: boolean;
    /** Переключение поиска по книге. */
    onToggleSearch?: () => void;
    /** Активный инструмент создания заметок. */
    tool?: NoteTool;
    /** Доступные формату типы заметок; один тип — переключать нечего. */
    allowedTypes?: readonly NoteType[];
    /** Смена инструмента заметок. */
    onToolChange?: (tool: NoteTool) => void;
  }

  let {
    tabs,
    activeTabId,
    booksOpen,
    notesOpen,
    propertiesOpen,
    focusMode = false,
    onToggleBooks,
    onToggleNotes,
    onToggleProperties,
    onToggleFocus,
    fontAvailable = false,
    readerFont = 'serif',
    onToggleFont,
    searchOpen = false,
    onToggleSearch,
    tool,
    allowedTypes = NOTE_TYPES,
    onToolChange,
  }: Props = $props();

  /** Активная вкладка — единственная, о которой говорит панель. */
  const tab = $derived(tabs.find((item) => item.id === activeTabId) ?? null);

  /** Номер активной вкладки: её место в составе рабочего места. */
  const tabNumber = $derived(
    tab ? tabs.findIndex((item) => item.id === tab.id) + 1 : null,
  );

  /** Пользовательский цвет вкладки — на номере, как в списке вкладок. */
  const mark = $derived(tab ? tabColorMark(tab.color, { active: true }) : undefined);

  /** Состояние поповера инструмента заметок. */
  let toolOpen = $state(false);

  /** Подпись кнопки гарнитуры. */
  const fontTitle = $derived(
    readerFont === 'serif' ? t('app.font.switchToSans') : t('app.font.switchToSerif'),
  );

  /** Есть ли что выбирать в инструменте заметок. */
  const toolChoosable = $derived(allowedTypes.length > 1 && tool !== undefined);

  /** Доступные типы заметок в порядке панели. */
  const typeOptions = $derived(NOTE_TYPES.filter((type) => allowedTypes.includes(type)));

  /** Образцы цвета заметки. */
  const colorSwatches = $derived<ColorSwatch[]>(
    NOTE_COLORS.map((color) => ({
      id: color,
      label: noteColorLabel(color),
      value: NOTE_COLOR_SWATCHES[color],
      selected: tool?.color === color,
    })),
  );

  /** Выбор типа заметки. */
  function selectType(type: NoteType) {
    if (tool && type !== tool.type) {
      onToolChange?.({ ...tool, type });
    }
  }

  /** Выбор вида фигуры. */
  function selectShape(shape: ShapeKind) {
    if (tool) {
      onToolChange?.({ ...tool, shape });
    }
  }

  /** Выбор цвета заметки. */
  function selectColor(color: NoteColor) {
    if (tool && color !== tool.color) {
      onToolChange?.({ ...tool, color });
    }
  }
</script>

<!--
  Панель активной вкладки: единственное место, где книга названа целиком.

  Горизонтальных вкладок в приложении нет — весь состав рабочего места живёт в
  панели списка слева. Здесь остаётся только активная книга: номер, иконка,
  название и путь под ним. Места в одной строке достаточно на всю ширину окна,
  поэтому путь помещается целиком, а не обрезается, как в узкой вкладке.

  Слева — открытие книги: переключатель списка вкладок и добавление новой книги.
  Это одно действие: вкладку создаёт новая книга. Справа — действия над уже
  открытой книгой: заметки, свойства и сосредоточенное чтение. Так одна активная
  вкладка открывает сразу всё пространство работы с книгой.
-->
<div
  class="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden bg-[var(--app-bar-strip)] px-2 py-2 large-tablet:flex-nowrap large-tablet:gap-x-3 large-tablet:px-3 [--control-surface:var(--strip-control-surface)]"
  data-testid="workplace-tabs"
>
  <!--
    Слева — работа с книгой: переключатель списка вкладок, заметки и свойства.
    Это действия над открытой книгой, поэтому они стоят рядом с её названием.
    Открытие новой книги живёт в панели вкладок: новую вкладку создаёт книга.
  -->
  <div class="flex flex-none items-center gap-0.5" data-testid="workplace-open-actions">
    <Button
      variant={booksOpen ? 'primary' : 'ghost'}
      size="icon"
      title={hotkeyHint('workplace.books', t('app.workplace.tabs'))}
      ariaLabel={t('app.workplace.tabs')}
      ariaPressed={booksOpen}
      testId="workplace-books-toggle"
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
    <Button
      variant={propertiesOpen ? 'primary' : 'ghost'}
      size="icon"
      title={hotkeyHint('workplace.properties', t('app.workplace.properties'))}
      ariaLabel={t('app.workplace.properties')}
      testId="workplace-properties-toggle"
      ariaPressed={propertiesOpen}
      onclick={onToggleProperties}
    >
      <Icon name="book" />
    </Button>
  </div>

  {#if tab}
    <div
      class="flex min-w-0 flex-1 items-center gap-2"
      style={mark ? `--tab-mark-fill: ${mark.fill}; --tab-mark-ink: ${mark.ink};` : ''}
      data-testid="workplace-active-tab"
    >
      <!--
        Номер стоит первым и несёт пользовательский цвет вкладки: он тот же, что
        в списке слева, поэтому книгу узнают по одному признаку в обоих местах.
      -->
      <span
        class="flex size-[calc(var(--spacing)*7)] shrink-0 items-center justify-center text-sm font-semibold tabular-nums {tab.color
          ? 'rounded-[calc(var(--radius)*0.5)] bg-[var(--tab-mark-fill)] text-[var(--tab-mark-ink)]'
          : 'opacity-60'}"
        data-testid="workplace-tab-number"
        >{tabNumber}</span
      >
      <span
        class="flex min-w-0 flex-1 items-center gap-1.5"
        title={tabTooltip(tab)}
        data-testid="workplace-active-title"
      >
        {#if tab.icon}
          <Icon name={tab.icon} class="size-4 shrink-0" />
        {/if}
        <!--
          Подпись — имя вкладки, если оно задано, иначе название книги. Путь
          переехал в строку книги: он нужен реже и не должен делить место с
          названием.
        -->
        <span class="min-w-0 truncate role-subtitle" data-testid="workplace-tab"
          >{tabLabel(tab)}</span
        >
      </span>
    </div>
  {:else}
    <div class="min-w-0 flex-1"></div>
  {/if}

  <!--
    Действия над активной книгой. Панели и сосредоточенное чтение стоят одним
    рядом справа: состав панели от их состояния не меняется, поэтому нажатие не
    сдвигает соседние кнопки. Добавление сюда не входит — оно открывает новую
    книгу, а не действует на текущую.
  -->
  <div
    class="ml-auto flex flex-none items-center gap-0.5 large-tablet:ml-0"
    data-testid="workplace-tabs-actions"
  >
    <!--
      Работа с текстом книги: поиск, инструмент заметки и гарнитура. Раньше эти
      кнопки стояли в строке книги; они переехали сюда, потому что относятся к
      книге целиком, а строка внизу освободилась под путь к файлу.
    -->
    {#if onToggleSearch}
      <Button
        size="icon"
        variant={searchOpen ? 'primary' : 'ghost'}
        title={hotkeyHint('reader.search', t('app.reader.searchShort'))}
        ariaLabel={t('app.reader.searchShort')}
        ariaPressed={searchOpen}
        testId="reader-search-toggle"
        onclick={onToggleSearch}
      >
        <Icon name="search" />
      </Button>
    {/if}

    {#if toolChoosable && tool}
      <Popover
        bind:open={toolOpen}
        side="bottom"
        align="end"
        class="w-[15rem]"
        testId="book-tool-menu"
      >
        {#snippet trigger({ props })}
          <button
            type="button"
            {...props}
            class="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors hover:bg-[var(--surface-hover)] {tool.type ===
 'quote'
 ? 'text-[var(--muted-foreground)] hover:text-[var(--foreground)]'
 : 'bg-[var(--primary)] text-[var(--primary-foreground)]'}"
            title={t('app.bookBar.tool')}
            aria-label={t('app.bookBar.tool')}
            aria-pressed={tool.type !== 'quote'}
            data-testid="book-bar-tool"
          >
            <Icon name="pencil" />
          </button>
        {/snippet}
        <div class="flex flex-col gap-2">
          <div
            class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
            role="group"
            aria-label={t('app.note.typeLabel')}
          >
            {#each typeOptions as type (type)}
              <Button
                variant={tool.type === type ? 'primary' : 'ghost'}
                size="sm"
                title={noteTypeLabel(type)}
                ariaLabel={noteTypeLabel(type)}
                ariaPressed={tool.type === type}
                class="flex-1"
                onclick={() => selectType(type)}
              >
                <Icon name={type} />
              </Button>
            {/each}
          </div>
          {#if tool.type === 'shape' && typeOptions.includes('shape')}
            <div
              class="flex items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
              role="group"
              aria-label={t('app.note.shapeLabel')}
              data-testid="note-tool-shape"
            >
              {#each SHAPE_KINDS as shape (shape)}
                <Button
                  variant={tool.shape === shape ? 'primary' : 'ghost'}
                  size="sm"
                  title={shapeKindLabel(shape)}
                  ariaLabel={shapeKindLabel(shape)}
                  ariaPressed={tool.shape === shape}
                  class="flex-1"
                  onclick={() => selectShape(shape)}
                >
                  <Icon name="shape" />
                </Button>
              {/each}
            </div>
            <ColorPicker
              colors={colorSwatches}
              onpick={(id) => selectColor(id as NoteColor)}
              ariaLabel={t('app.note.colorMenuLabel')}
              testIdPrefix="note-tool-color"
              size="sm"
            />
          {/if}
        </div>
      </Popover>
    {/if}

    {#if fontAvailable && onToggleFont}
      <Button
        size="icon"
        variant="ghost"
        title={fontTitle}
        ariaLabel={fontTitle}
        testId="reader-font-toggle"
        onclick={onToggleFont}
      >
        <span
          class="text-base leading-none"
          style="font-family: {readerFont === 'serif'
            ?"system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
            :"Georgia, 'Times New Roman', serif"}"
          aria-hidden="true">Аа</span
        >
      </Button>
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
</div>
