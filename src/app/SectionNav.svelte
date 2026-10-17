<script lang="ts">
  import { Icon, type IconName } from '@texture/ui';

  /**
   * Меню разделов приложения — единственный источник навигации.
   *
   * Две компоновки одного и того же меню, выбираемые шириной окна:
   * - **широкое окно** — постоянная колонка слева: разделы (рабочие места,
   *   библиотеки, заметки), снизу служебные пункты (тема, уведомления,
   *   настройки) и индикатор замечаний. Колонка раскрывается: в раскрытом виде
   *   пункт показывает название, в свёрнутом — только иконку с подсветкой при
   *   наведении и доступным именем;
   * - **телефон** — нижняя навигация: те же разделы и служебные пункты
   *   иконками с короткими подписями, прижатая к нижнему краю и учитывающая
   *   безопасную зону экрана.
   *
   * Обе компоновки не существуют одновременно в разметке: активна ровно одна,
   * поэтому доступные имена и метки для тестов не дублируются.
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
    /** Раскрыто ли меню (показываются названия пунктов); важно только на широком окне. */
    expanded: boolean;
    /** Телефонная компоновка: нижняя навигация вместо колонки слева. */
    mobile: boolean;
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
    mobile,
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

  /** Короткая подпись раздела для нижней навигации на телефоне. */
  const shortLabels: Record<string, string> = {
    workspace: 'Места',
    library: 'Книги',
    notes: 'Заметки',
  };

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

  /** Класс корня меню: колонка слева на широком окне, нижняя полоса на телефоне. */
  const rootClass = $derived(
    mobile
      ? 'flex w-full flex-none items-stretch gap-1 border-t border-[var(--border)] bg-[var(--panel)] px-1 pt-1'
      : `flex shrink-0 flex-col items-stretch gap-1 border-r border-[var(--border)] bg-[var(--panel)] py-2 transition-[width] duration-150 ${
          expanded ? 'w-[13rem] px-2' : 'w-[4.25rem] px-1.5'
        }`,
  );
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

{#snippet mobileTab(item: {
  id: string;
  label: string;
  icon: IconName;
  active: boolean;
  title: string;
  ariaLabel: string;
  onClick: () => void;
  badge?: number;
  accent?: string;
})}
  <button
    type="button"
    class="relative flex min-h-[var(--touch-target)] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1 transition-colors [font:inherit]"
    class:bg-[var(--primary-soft)]={item.active}
    class:text-[var(--primary)]={item.active}
    class:text-[var(--muted-foreground)]={!item.active}
    class:hover:bg-[var(--muted)]={!item.active}
    aria-pressed={item.active}
    aria-label={item.ariaLabel}
    title={item.title}
    data-testid={`nav-${item.id}`}
    onclick={item.onClick}
  >
    <Icon name={item.icon} class="h-[1.375rem] w-[1.375rem]" />
    <span class="hidden min-[22.5rem]:inline role-caption leading-none">{item.label}</span>
    {#if item.badge && item.badge > 0}
      <span
        class="absolute top-0.5 right-1/2 flex h-4 min-w-4 translate-x-3 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none text-[var(--primary-foreground)]"
        style:background={item.accent ?? 'var(--success)'}
      >
        {item.badge}
      </span>
    {/if}
  </button>
{/snippet}

<nav
  class="{rootClass} {className}"
  aria-label="Разделы приложения"
  data-testid="section-nav"
  data-expanded={expanded ? 'true' : 'false'}
  data-mobile={mobile ? 'true' : 'false'}
  style={mobile ? 'padding-bottom: var(--safe-bottom);' : undefined}
>
  {#if mobile}
    {#each sections as item (item.id)}
      {@render mobileTab({
        id: item.id,
        label: shortLabels[item.id] ?? item.label,
        icon: item.icon,
        active: item.active,
        title: item.label,
        ariaLabel: item.label,
        onClick: () => selectSection(item.id),
      })}
    {/each}

    {#if alertCount > 0}
      <span
        class="relative flex min-h-[var(--touch-target)] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1"
        role="status"
        data-testid="header-alerts"
        title={alertTitles}
        aria-label={`Замечания: ${alertCount}`}
        style:color={alertError ? 'var(--destructive)' : 'var(--warning)'}
      >
        <span class="flex h-[1.375rem] items-center justify-center role-title">{alertCount}</span>
        <span class="hidden min-[22.5rem]:inline role-caption leading-none">Замечания</span>
      </span>
    {/if}

    {@render mobileTab({
      id: 'notifications',
      label: 'Лента',
      icon: 'bell',
      active: notificationsOpen,
      title: 'Уведомления',
      ariaLabel: 'Уведомления',
      onClick: onNotifications,
      badge: unreadCount,
    })}

    {@render mobileTab({
      id: 'settings',
      label: 'Настройки',
      icon: 'gear',
      active: settingsOpen,
      title: 'Настройки',
      ariaLabel: 'Настройки',
      onClick: onSettings,
    })}
  {:else}
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
  {/if}
</nav>
