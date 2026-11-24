<script lang="ts">
  import { t } from '@context/i18n';
  import { Button, Icon } from '@context/ui';
  import type { WorkspaceTab } from './workplace';
  import { tabBookTitle, tabColorMark, tabCustomName, tabTooltip } from './tab-appearance';
  import { hotkeyHint } from '../hotkeys/registry';

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
    /** Открыта ли панель поиска по книге. */
    searchOpen?: boolean;
    /** Переключение поиска по книге. */
    onToggleSearch?: () => void;
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
    searchOpen = false,
    onToggleSearch,
  }: Props = $props();

  /** Активная вкладка — единственная, о которой говорит панель. */
  const tab = $derived(tabs.find((item) => item.id === activeTabId) ?? null);

  /** Номер активной вкладки: её место в составе рабочего места. */
  const tabNumber = $derived(
    tab ? tabs.findIndex((item) => item.id === tab.id) + 1 : null,
  );

  /** Пользовательский цвет вкладки — на номере, как в списке вкладок. */
  const mark = $derived(tab ? tabColorMark(tab.color, { active: true }) : undefined);
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
  class="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 overflow-hidden bg-[var(--app-bar-strip)] px-2 large-tablet:flex-nowrap large-tablet:gap-x-3 large-tablet:px-3 [--control-surface:var(--strip-control-surface)]"
  data-testid="workplace-tabs"
>
  <!--
    Слева — работа с книгой: переключатель списка вкладок, заметки и свойства.
    Это действия над открытой книгой, поэтому они стоят рядом с её названием.
    Открытие новой книги живёт в панели вкладок: новую вкладку создаёт книга.
  -->
  <div class="flex flex-none items-center gap-0.5 py-2" data-testid="workplace-open-actions">
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
    <!--
      Поиск по книге стоит сразу за её панелями: это действие над открытой
      книгой, поэтому оно в одном ряду с вкладками, заметками и свойствами.
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
  </div>

  {#if tab}
    <!--
      Активная вкладка — не отдельная плашка внутри панели, а её собственная
      секция: заливка идёт от края до края по высоте панели, поля дают воздух
      содержимому, а не уменьшают его. Поэтому две строки подписи не растягивают
      панель: место занимает сама секция, а не её внешние отступы.
      Цвет вкладки остаётся на номере.
    -->
    <div
      class="flex min-w-0 flex-1 items-center gap-2 self-stretch bg-[var(--tab-active-surface)] px-2 text-[var(--tab-active-foreground)] large-tablet:px-3"
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
      <!--
        Иконка, название книги и своё имя стоят в одном столбце: иконка в
        строке книги, имя ниже — без отступа слева, от того же края.
      -->
      <span
        class="flex min-w-0 flex-1 flex-col gap-0.5"
        title={tabTooltip(tab)}
        data-testid="workplace-active-title"
      >
        <span class="flex min-w-0 items-center gap-1.5">
          {#if tab.icon}
            <Icon name={tab.icon} class="size-4 shrink-0" />
          {/if}
          <span class="min-w-0 truncate role-subtitle" data-testid="workplace-tab"
            >{tabBookTitle(tab)}</span
          >
        </span>
        {#if tabCustomName(tab)}
          <span class="min-w-0 truncate role-caption" data-testid="workplace-tab-name"
            >{tabCustomName(tab)}</span
          >
        {/if}
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
    class="ml-auto flex flex-none items-center gap-0.5 py-2 large-tablet:ml-0"
    data-testid="workplace-tabs-actions"
  >
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
