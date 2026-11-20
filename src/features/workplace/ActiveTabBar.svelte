<script lang="ts">
  import { t } from '@context/i18n';
  import { Button, Icon } from '@context/ui';
  import type { WorkspaceTab } from './workplace';
  import { openAvailability } from './workplace';
  import { tabColorMark, tabFormatLabel, tabLabel, tabTooltip } from './tab-appearance';
  import { hotkeyHint } from '../hotkeys/registry';
  import { logEvent } from '../../shared/app-log';

  interface Props {
    /** Вкладки рабочего места: по ним считается доступность добавления. */
    tabs: WorkspaceTab[];
    /** Активная вкладка; `null` — открытых книг нет. */
    activeTabId: string | null;
    /** Лимит числа открытых вкладок рабочего места. */
    openTabsLimit: number;
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
    /** Добавление книги (переход в библиотеку). */
    onAdd: () => void;
    /** Открытие книги с диска. */
    onAddFile: () => void;
    /** Переключение режима сосредоточенного чтения. */
    onToggleFocus?: () => void;
  }

  let {
    tabs,
    activeTabId,
    openTabsLimit,
    booksOpen,
    notesOpen,
    propertiesOpen,
    focusMode = false,
    onToggleBooks,
    onToggleNotes,
    onToggleProperties,
    onAdd,
    onAddFile,
    onToggleFocus,
  }: Props = $props();

  /** Активная вкладка — единственная, о которой говорит панель. */
  const tab = $derived(tabs.find((item) => item.id === activeTabId) ?? null);

  /** Номер активной вкладки: её место в составе рабочего места. */
  const tabNumber = $derived(
    tab ? tabs.findIndex((item) => item.id === tab.id) + 1 : null,
  );

  /** Доступность добавления книги при текущем лимите вкладок. */
  const availability = $derived(openAvailability(tabs.length, openTabsLimit));

  /** Создание новых вкладок заблокировано: лимит достигнут или превышен. */
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

  /** Пользовательский цвет вкладки — на номере, как в списке вкладок. */
  const mark = $derived(tab ? tabColorMark(tab.color, { active: true }) : undefined);

  /** Подпись формата книги: показывает, какой файл открыт. */
  const format = $derived(tab ? tabFormatLabel(tab) : undefined);
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
  class="flex flex-none flex-wrap items-center gap-x-3 gap-y-1 overflow-hidden bg-[var(--app-bar-strip)] px-3 py-2 large-tablet:flex-nowrap [--control-surface:var(--strip-control-surface)]"
  data-testid="workplace-tabs"
>
  <!--
    Открытие вкладки и открытие книги — одно действие: новую вкладку создаёт
    новая книга. Поэтому добавление стоит рядом с переключателем списка вкладок,
    а не среди действий над текущей книгой.
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

  {#if tab}
    <div
      class="flex min-w-0 flex-1 items-center gap-2.5 min-w-[10rem]"
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
      <div class="flex min-w-0 flex-1 flex-col" title={tabTooltip(tab)}>
        <span
          class="flex min-w-0 items-center gap-1.5"
          data-testid="workplace-active-title"
        >
          {#if tab.icon}
            <Icon name={tab.icon} class="size-4 shrink-0" />
          {/if}
          <span class="min-w-0 truncate role-subtitle" data-testid="workplace-tab"
            >{tabLabel(tab)}</span
          >
          {#if format}
            <span
              class="shrink-0 rounded-[calc(var(--radius)*0.5)] bg-[var(--control-surface)] px-[0.4em] text-[0.85em] leading-[1.5] tracking-wide text-[var(--muted-foreground)]"
              data-testid="workplace-active-format"
              >{format}</span
            >
          {/if}
        </span>
        <!--
          Путь стоит под названием приглушённой подписью: он называет файл, но не
          спорит с названием книги. Подсказка повторяет путь целиком — на узком
          окне строка обрезается многоточием.
        -->
        <span
          class="min-w-0 truncate role-caption text-[var(--muted-foreground)]"
          title={tab.path}
          data-testid="workplace-active-path"
          >{tab.path}</span
        >
      </div>
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
      <Icon name="layers" />
    </Button>
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
