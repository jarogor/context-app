<script lang="ts">
  import { Icon, type IconName, type ResolvedTheme } from '@context/ui';
  import { t } from '@context/i18n';
  import logoMarkup from './context-logo.svg?raw';
  import SectionNav from './SectionNav.svelte';

  /**
   * Верхняя панель приложения — постоянный «корешок» оболочки.
   *
   * Слева — название приложения и навигационный текст: где находится
   * пользователь и что выбрано (раздел или имя открытого рабочего места). Справа
   * — меню разделов и служебные действия: индикатор замечаний, переключатель
   * темы и настройки. Панель не прокручивается и держит разделы всегда
   * доступными. На телефоне она сжимается до названия и действий, а разделы
   * переезжают в нижнюю навигацию.
   */
  interface Props {
    /** Название раздела: где находится пользователь. */
    section: string;
    /** Имя выбранного объекта раздела (рабочее место, библиотека), либо `null`. */
    selection: string | null;
    /** Открыт ли список рабочих мест. */
    workspaceActive: boolean;
    /** Открыт ли раздел «Библиотеки». */
    libraryActive: boolean;
    /** Открыт ли раздел «Заметки». */
    notesActive: boolean;
    /** Открыт ли раздел настроек. */
    settingsOpen: boolean;
    /** Число замечаний (неприменённые изменения, ошибки работы). */
    alertCount: number;
    /** Тексты замечаний для подсказки индикатора. */
    alertTitles: string;
    /** Есть ли замечания-ошибки (иначе замечания помечаются как предупреждение). */
    alertError: boolean;
    /** Показанная сейчас сторона темы. */
    theme: ResolvedTheme;
    /** Сторона, которую поставит нажатие кнопки. */
    themeNext: ResolvedTheme;
    /** Узкое окно: разделы показываются кнопками-иконками без подписей. */
    mobile: boolean;
    /** Выбор раздела «Рабочие места». */
    onWorkspace: () => void;
    /** Выбор раздела «Библиотеки». */
    onLibrary: () => void;
    /** Выбор раздела «Заметки». */
    onNotes: () => void;
    /** Открытие раздела настроек. */
    onSettings: () => void;
    /** Переключение темы. */
    onTheme: () => void;
  }

  let {
    section,
    selection,
    workspaceActive,
    libraryActive,
    notesActive,
    settingsOpen,
    alertCount,
    alertTitles,
    alertError,
    theme,
    themeNext,
    mobile,
    onWorkspace,
    onLibrary,
    onNotes,
    onSettings,
    onTheme,
  }: Props = $props();

  /** Подсказка навигационного текста: полный путь к выбранному объекту. */
  const contextTitle = $derived(
    selection ? `${section}${t('app.context.separator')}${selection}` : section,
  );

  /** Иконка кнопки: показывает текущую сторону темы.
   *
   * Третьего положения «как в системе» у кнопки нет — этот режим выбирают в
   * настройках. Поэтому при системном предпочтении иконка показывает тему,
   * которую сейчас видит пользователь, а не состояние настройки.
   */
  const themeIcon: IconName = $derived(theme === 'dark' ? 'moon' : 'sun');

  /** Подпись кнопки: называет сторону, на которую она переключит. */
  const themeTitle = $derived(
    t('app.theme.title', {
      theme: themeNext === 'dark' ? t('app.theme.dark') : t('app.theme.light'),
    }),
  );
</script>

<header
  class="flex flex-none items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3 md:gap-4 md:px-4"
  style="min-height: var(--app-bar-height); padding-top: var(--safe-top);"
  data-testid="app-bar"
>
  <!--
    Знак приложения — логотип из файла `context-logo.svg`. Знак стоит в шапке
    один, без подписи рядом: настоящее имя остаётся доступным именем элемента,
    его читают экранные дикторы, и оно попадает в подсказку.

    Логотип вставляется разметкой, а не картинкой: его контуры рисуются
    `currentColor` и берут цвет активной темы (`--primary`), поэтому знак
    согласован с выделением раздела и виден на светлой и тёмной стороне. Размер
    задан в `rem` (1.75rem) и остаётся меньше высоты шапки, поэтому знак
    заметный, но высоту шапки не меняет.
  -->
  <span
    class="text-[var(--primary)] flex size-7 shrink-0 items-center justify-center [&>svg]:size-full"
    data-testid="app-name"
    role="img"
    aria-label={t('app.name')}
    title={t('app.name')}
  >
    {@html logoMarkup}
  </span>
  <span class="hidden h-6 w-px shrink-0 bg-[var(--border)] md:block" aria-hidden="true"></span>
  <!--
    Навигационный текст. На узком окне (телефон, планшет) остаётся только имя
    выбранного объекта: название раздела уже показано меню-иконками, и «Рабочее
    место · foo» занимало бы место без пользы. На широком окне показывается и
    раздел, и выбор — шапка остаётся единственным местом, где это видно.
  -->
  <span
    class="min-w-0 truncate role-caption text-[var(--muted-foreground)] max-md:ml-4"
    data-testid="app-context"
    title={contextTitle}
  >
    {#if mobile && selection}
      <span class="font-semibold">{selection}</span>
    {:else}
      {section}{#if selection}{t('app.context.separator')}<span class="font-semibold">{selection}</span>{/if}
    {/if}
  </span>

  <!--
    Действия верхней панели. На телефоне они переезжают в нижнюю навигацию
    (`SectionNav`), и здесь не рисуются вовсе: активна ровно одна компоновка, а
    не две с повторяющимися доступными именами и метками для тестов.
  -->
  {#if !mobile}
    <div class="ml-auto flex min-w-0 items-center gap-2 md:gap-4">
      <SectionNav
        {workspaceActive}
        {libraryActive}
        {notesActive}
        {mobile}
        {onWorkspace}
        {onLibrary}
        {onNotes}
      />

      <div class="flex shrink-0 items-center gap-1">
        {#if alertCount > 0}
          <span
            class="flex h-8 min-w-8 items-center justify-center rounded-full px-2 role-caption"
            role="status"
            data-testid="header-alerts"
            title={alertTitles}
            aria-label={t('app.alerts', { count: alertCount })}
            style:background={alertError ? 'var(--destructive)' : 'var(--warning)'}
            style:color={alertError ? 'var(--destructive-foreground)' : 'var(--primary-foreground)'}
          >
            {alertCount}
          </span>
        {/if}

        <button
          type="button"
          class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          title={themeTitle}
          aria-label={t('app.theme.switch')}
          data-testid="nav-theme"
          onclick={onTheme}
        >
          <Icon name={themeIcon} class="h-[1.15rem] w-[1.15rem]" />
        </button>

        <button
          type="button"
          class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          class:bg-[var(--primary-soft)]={settingsOpen}
          title={t('app.settings')}
          aria-label={t('app.settings')}
          aria-pressed={settingsOpen}
          data-testid="nav-settings"
          onclick={onSettings}
        >
          <Icon name="menu" class="h-[1.15rem] w-[1.15rem]" />
        </button>
      </div>
    </div>
  {/if}
</header>
