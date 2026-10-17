<script lang="ts">
  import { Icon, type IconName } from '@texture/ui';

  /**
   * Меню разделов приложения.
   *
   * Постоянная колонка слева — единственный источник навигации: разделы
   * (рабочие места, библиотеки, заметки) и служебные пункты внизу (тема,
   * уведомления, настройки, индикатор замечаний). Разделы взаимоисключающие,
   * активный выделен. Меню раскрывается: в раскрытом виде пункт показывает
   * название, в свёрнутом — только иконку с подсветкой при наведении, а полный
   * текст остаётся в доступном имени и подсказке.
   */
  interface Props {
    /** Название приложения. */
    appName: string;
    /** Открыт ли список рабочих мест. */
    workspaceActive: boolean;
    /** Открыт ли раздел «Библиотеки». */
    libraryActive: boolean;
    /** Открыт ли раздел «Заметки». */
    notesActive: boolean;
    /** Открыта ли панель уведомлений. */
    notificationsOpen: boolean;
    /** Открыт ли раздел настроек. */
    settingsOpen: boolean;
    /** Число непрочитанных уведомлений. */
    unreadCount: number;
    /** Число замечаний (неприменённые изменения, ошибки работы). */
    alertCount: number;
    /** Тексты замечаний для подсказки индикатора. */
    alertTitles: string;
    /** Есть ли замечания-ошибки (иначе замечания помечаются как предупреждение). */
    alertError: boolean;
    /** Предпочтение темы для подачи кнопки. */
    themeTitle: string;
    /** Раскрыто ли меню (показаны названия пунктов). */
    expanded: boolean;
    /** Выбор раздела «Рабочие места». */
    onWorkspace: () => void;
    /** Выбор раздела «Библиотеки». */
    onLibrary: () => void;
    /** Выбор раздела «Заметки». */
    onNotes: () => void;
    /** Переключение панели уведомлений. */
    onNotifications: () => void;
    /** Открытие раздела настроек. */
    onSettings: () => void;
    /** Переключение темы. */
    onTheme: () => void;
    /** Переключение раскрытия меню. */
    onToggleExpanded: () => void;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    appName,
    workspaceActive,
    libraryActive,
    notesActive,
    notificationsOpen,
    settingsOpen,
    unreadCount,
    alertCount,
    alertTitles,
    alertError,
    themeTitle,
    expanded,
    onWorkspace,
    onLibrary,
    onNotes,
    onNotifications,
    onSettings,
    onTheme,
    onToggleExpanded,
    class: className = '',
  }: Props = $props();

  /** Разделы приложения в порядке показа. */
  const sections: Array<{ id: string; label: string; icon: IconName; active: boolean }> = $derived([
    { id: 'workspace', label: 'Рабочие места', icon: 'workspace', active: workspaceActive },
    { id: 'library', label: 'Библиотеки', icon: 'library', active: libraryActive },
    { id: 'notes', label: 'Заметки', icon: 'note', active: notesActive },
  ]);

  /** Иконка переключателя темы по предпочтению. */
  const themeIcon = $derived(
    themeTitle === 'Светлая' ? 'sun' : themeTitle === 'Тёмная' ? 'moon' : 'monitor',
  );

  /** Служебные пункты внизу меню (кроме уведомлений: у них счётчик). */
  const utilityItems: Array<{
    id: string;
    label: string;
    icon: IconName;
    active: boolean;
    title: string;
    ariaLabel: string;
    onClick: () => void;
  }> = $derived([
    {
      id: 'theme',
      label: 'Тема',
      icon: themeIcon,
      active: false,
      title: `Тема: ${themeTitle}`,
      ariaLabel: 'Переключить тему',
      onClick: onTheme,
    },
    {
      id: 'settings',
      label: 'Настройки',
      icon: 'gear',
      active: settingsOpen,
      title: 'Настройки',
      ariaLabel: 'Настройки',
      onClick: onSettings,
    },
  ]);

  /** Обработчик раздела по идентификатору. */
  function selectSection(id: string) {
    if (id === 'workspace') {
      onWorkspace();
    } else if (id === 'library') {
      onLibrary();
    } else if (id === 'notes') {
      onNotes();
    }
  }
</script>

{#snippet navButton(item: {
  id: string;
  label: string;
  icon: IconName;
  active: boolean;
  title?: string;
  ariaLabel?: string;
  onClick: () => void;
})}
  <button
    type="button"
    class="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 transition-colors [font:inherit]"
    class:justify-center={!expanded}
    class:bg-[var(--primary)]={item.active}
    class:text-[var(--primary-foreground)]={item.active}
    class:text-[var(--muted-foreground)]={!item.active}
    class:hover:bg-[var(--muted)]={!item.active}
    class:hover:text-[var(--foreground)]={!item.active}
    aria-pressed={item.active}
    aria-label={item.ariaLabel ?? item.label}
    title={item.title ?? item.label}
    data-testid={`nav-${item.id}`}
    onclick={item.onClick}
  >
    <Icon name={item.icon} class="h-[1.25rem] w-[1.25rem]" />
    {#if expanded}
      <span class="min-w-0 truncate role-body text-left">{item.label}</span>
    {/if}
  </button>
{/snippet}

<!--
  Постоянное меню разделов слева: разделы сверху, служебные пункты прижаты к
  низу. Активный раздел залит акцентом; в свёрнутом виде пункт показывает только
  иконку, наведение показывает фон. Ширина колонки в `rem`, чтобы расти вместе с
  масштабом интерфейса.
-->
<nav
  class="flex shrink-0 flex-col items-stretch gap-1 border-r border-[var(--border)] bg-[var(--panel)] py-2 transition-[width] duration-150"
  class:w-[13rem]={expanded}
  class:w-[4.25rem]={!expanded}
  class:px-2={expanded}
  class:px-1.5={!expanded}
  aria-label="Разделы приложения"
  data-testid="section-nav"
  data-expanded={expanded ? 'true' : 'false'}
>
  {#if expanded}
    <div class="mb-2 flex items-center gap-2">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[var(--primary)] role-title text-[var(--primary-foreground)]"
        title={appName}
      >
        {appName.slice(0, 1)}
      </span>
      <span class="min-w-0 flex-1 truncate role-subtitle text-[var(--foreground)]">{appName}</span>
      <button
        type="button"
        class="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] [font:inherit]"
        aria-label="Скрыть названия разделов"
        title="Скрыть названия разделов"
        data-testid="nav-collapse"
        onclick={onToggleExpanded}
      >
        <Icon name="chevron-left" class="h-[1.25rem] w-[1.25rem]" />
      </button>
    </div>
  {:else}
    <button
      type="button"
      class="mb-2 flex h-9 w-full cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)] [font:inherit]"
      aria-label="Показать названия разделов"
      title="Показать названия разделов"
      data-testid="nav-expand"
      onclick={onToggleExpanded}
    >
      <Icon name="menu" class="h-[1.25rem] w-[1.25rem]" />
    </button>
  {/if}

  {#each sections as item (item.id)}
    {@render navButton({
      id: item.id,
      label: item.label,
      icon: item.icon,
      active: item.active,
      onClick: () => selectSection(item.id),
    })}
  {/each}

  <div class="mt-auto flex flex-col items-stretch gap-1">
    {#if alertCount > 0}
      <span
        class="flex h-8 min-w-8 items-center justify-center rounded-md px-1 role-caption"
        role="status"
        data-testid="header-alerts"
        title={alertTitles}
        aria-label={`Замечания: ${alertCount}`}
        style:background={alertError ? 'var(--destructive)' : 'var(--warning)'}
        style:color={alertError ? 'var(--destructive-foreground)' : 'var(--primary-foreground)'}
      >
        {alertCount}
      </span>
    {/if}

    <button
      type="button"
      class="relative flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[var(--muted-foreground)] transition-colors [font:inherit] hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      class:justify-center={!expanded}
      aria-label="Уведомления"
      aria-pressed={notificationsOpen}
      title="Уведомления"
      data-testid="nav-notifications"
      onclick={onNotifications}
    >
      <Icon name="bell" class="h-[1.25rem] w-[1.25rem]" />
      {#if expanded}
        <span class="min-w-0 truncate role-body">Уведомления</span>
      {/if}
      {#if unreadCount > 0}
        <span
          class="absolute top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 role-caption text-[var(--primary-foreground)]"
          class:right-2={expanded}
          class:right-1={!expanded}
          style:background="var(--success)"
        >
          {unreadCount}
        </span>
      {/if}
    </button>

    {#each utilityItems as item (item.id)}
      {@render navButton(item)}
    {/each}
  </div>
</nav>
