<script lang="ts">
  import { t } from '@context/i18n';
  import { cn } from '@context/ui';
  import { Icon, type IconName, type ResolvedTheme } from '@context/ui';
  import logoMarkup from './context-logo.svg?raw';
  import SectionNav from './SectionNav.svelte';

  /**
   * Левое меню десктопа: постоянная колонка оболочки.
   *
   * Сверху — знак приложения, под ним разделы (рабочие места, книги, заметки).
   * Внизу — служебные действия: тема, настройки и сворачивание меню.
   *
   * Меню живёт в двух состояниях: развёрнутое — колонка с подписями, свёрнутое —
   * узкая полоса только с иконками. Свёрнутое состояние освобождает место
   * содержимому, не убирая навигацию совсем.
   *
   * Нижние действия стоят именно внизу: они меняются реже разделов и не должны
   * спорить с ними за внимание.
   */
  interface Props {
    /** Открыт ли список рабочих мест. */
    workspaceActive: boolean;
    /** Открыт ли раздел «Библиотеки». */
    libraryActive: boolean;
    /** Открыт ли раздел «Заметки». */
    notesActive: boolean;
    /** Открыт ли раздел настроек. */
    settingsOpen: boolean;
    /** В настройках есть важное, что ждёт внимания: точка на кнопке. */
    settingsAlert?: boolean;
    /** Показанная сейчас сторона темы. */
    theme: ResolvedTheme;
    /** Сторона, которую поставит нажатие кнопки. */
    themeNext: ResolvedTheme;
    /** Меню свёрнуто: только иконки, без подписей. */
    collapsed: boolean;
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
    /** Сворачивание и раскрытие меню. */
    onToggleCollapsed: () => void;
  }

  let {
    workspaceActive,
    libraryActive,
    notesActive,
    settingsOpen,
    settingsAlert = false,
    theme,
    themeNext,
    collapsed,
    onWorkspace,
    onLibrary,
    onNotes,
    onSettings,
    onTheme,
    onToggleCollapsed,
  }: Props = $props();

  /** Иконка кнопки темы: показывает текущую сторону. */
  const themeIcon: IconName = $derived(theme === 'dark' ? 'moon' : 'sun');

  /** Подпись кнопки темы: называет сторону, на которую она переключит. */
  const themeTitle = $derived(
    t('app.theme.title', {
      theme: themeNext === 'dark' ? t('app.theme.dark') : t('app.theme.light'),
    }),
  );

  /** Ширина колонки: подписи требуют места, иконки — нет. */
  const widthClass = $derived(collapsed ? 'w-14' : 'w-52');

  /** Классы кнопки меню: свёрнутая кнопка — квадрат по центру полосы. */
  const buttonClass = $derived(
    cn(
      'flex h-9 min-w-0 shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius)] transition-colors [font-family:inherit] pointer-coarse:h-11',
      collapsed ? 'w-10 justify-center self-center' : 'w-full px-2',
    ),
  );
</script>

<aside
  class="flex flex-none flex-col gap-1 bg-[var(--app-bar-surface)] px-2 py-3 transition-[width] {widthClass}"
  data-testid="side-nav"
  data-collapsed={collapsed ? 'true' : 'false'}
  style="padding-left: max(0.5rem, var(--safe-left));"
>
  <!--
    Знак приложения. В свёрнутом меню он остаётся один: по нему узнают
    приложение, и он же — единственный опознавательный знак полосы.
  -->
  <div class="mb-2 flex h-9 items-center gap-2 {collapsed ? 'justify-center' : 'px-2'}">
    <span
      class="text-[var(--primary)] flex size-9 shrink-0 items-center justify-center [&>svg]:size-full"
      role="img"
      aria-label={t('app.name')}
      title={t('app.name')}
      data-testid="app-name"
    >
      {@html logoMarkup}
    </span>
    {#if !collapsed}
      <span class="min-w-0 truncate role-subtitle text-[var(--foreground)]">{t('app.name')}</span>
    {/if}
  </div>

  <!--
    Разделы приложения. Названия — «Рабочее место», «Книги», «Заметки»: это
    те же разделы, что были в шапке, но в столбик и с постоянными подписями.
  -->
  <SectionNav
    layout="sidebar"
    {workspaceActive}
    {libraryActive}
    {notesActive}
    {collapsed}
    {onWorkspace}
    {onLibrary}
    {onNotes}
  />

  <div class="flex-1"></div>

  <!--
    Служебные действия внизу: тема, настройки, сворачивание. Порядок снизу
    вверх — от редкого к частому: сворачивание у самого края, настройки выше.
  -->
  <div class="flex flex-col gap-1" data-testid="side-nav-actions">
    <button
      type="button"
      class="{buttonClass} text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      title={themeTitle}
      aria-label={t('app.theme.switch')}
      data-testid="nav-theme"
      onclick={onTheme}
    >
      <Icon name={themeIcon} class="size-[calc(var(--spacing)*4.5)] shrink-0" />
      {#if !collapsed}
        <span class="min-w-0 truncate role-subtitle">{t('app.theme.short')}</span>
      {/if}
    </button>
    <button
      type="button"
      class="{buttonClass} relative {settingsOpen
        ? 'bg-[var(--primary-soft)] text-[var(--foreground)]'
        : 'text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'}"
      title={settingsAlert ? t('app.settings.attention') : t('app.settings')}
      aria-label={t('app.settings')}
      aria-pressed={settingsOpen}
      data-testid="nav-settings"
      onclick={onSettings}
    >
      <span class="relative flex shrink-0">
        <Icon name="gear" class="size-[calc(var(--spacing)*4.5)]" />
        {#if settingsAlert}
          <span
            class="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[var(--destructive)]"
            aria-hidden="true"
            data-testid="settings-alert-dot"
          ></span>
        {/if}
      </span>
      {#if !collapsed}
        <span class="min-w-0 truncate role-subtitle">{t('app.settings.short')}</span>
      {/if}
    </button>
    <button
      type="button"
      class="{buttonClass} text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]"
      title={collapsed ? t('app.sideNav.expand') : t('app.sideNav.collapse')}
      aria-label={collapsed ? t('app.sideNav.expand') : t('app.sideNav.collapse')}
      aria-expanded={!collapsed}
      data-testid="nav-collapse"
      onclick={onToggleCollapsed}
    >
      <Icon
        name={collapsed ? 'chevrons-right' : 'chevrons-left'}
        class="size-[calc(var(--spacing)*4.5)] shrink-0"
      />
      {#if !collapsed}
        <span class="min-w-0 truncate role-subtitle">{t('app.sideNav.collapse')}</span>
      {/if}
    </button>
  </div>
</aside>
