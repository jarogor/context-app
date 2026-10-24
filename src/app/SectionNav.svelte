<script lang="ts">
  import { Icon, type IconName } from '@texture/ui';

  /**
   * Навигация по разделам приложения — единственный источник переходов.
   *
   * Две компоновки одного и того же меню, выбираемые шириной окна; в разметке
   * активна ровно одна:
   * - **широкое окно** — горизонтальные вкладки в верхней панели: раздел читается
   *   как закладка в книге, а подчёркивание под активной вкладкой задаёт ось;
   * - **телефон** — нижняя навигация: те же разделы и служебные пункты иконками
   *   с короткими подписями, прижатая к нижнему краю и учитывающая безопасную
   *   зону экрана.
   */
  interface Props {
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
    /** Телефонная компоновка: нижняя навигация вместо вкладок. */
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
    /** Дополнительные классы. */
    class?: string;
  }

  let {
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
    mobile,
    onWorkspace,
    onLibrary,
    onNotes,
    onNotifications,
    onSettings,
    onTheme,
    class: className = '',
  }: Props = $props();

  /** Разделы приложения в порядке показа. */
  const sections: Array<{ id: string; label: string; icon: IconName; active: boolean }> = $derived([
    { id: 'workspace', label: 'Рабочее место', icon: 'workspace', active: workspaceActive },
    { id: 'library', label: 'Библиотека', icon: 'library', active: libraryActive },
    { id: 'notes', label: 'Заметки', icon: 'note', active: notesActive },
  ]);

  /** Короткая подпись раздела для нижней навигации на телефоне. */
  const shortLabels: Record<string, string> = {
    workspace: 'Место',
    library: 'Книги',
    notes: 'Заметки',
  };

  /** Иконка переключателя темы по предпочтению. */
  const themeIcon = $derived(
    themeTitle === 'Светлая' ? 'sun' : themeTitle === 'Тёмная' ? 'moon' : 'monitor',
  );

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

{#snippet desktopTab(item: { id: string; label: string; icon: IconName; active: boolean })}
  <button
    type="button"
    class="flex shrink-0 cursor-pointer items-center gap-2 rounded-[var(--radius)] px-3 py-1.5 text-[var(--foreground)] transition-colors [font:inherit]"
    class:bg-[var(--primary)]={item.active}
    class:text-[var(--primary-foreground)]={item.active}
    class:hover:bg-[var(--surface-hover)]={!item.active}
    aria-pressed={item.active}
    aria-label={item.label}
    title={item.label}
    data-testid={`nav-${item.id}`}
    onclick={() => selectSection(item.id)}
  >
    <Icon name={item.icon} class="h-[1.15rem] w-[1.15rem]" />
    <span class="min-w-0 truncate role-subtitle">{item.label}</span>
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
})}
  <button
    type="button"
    class="relative flex min-h-[var(--touch-target)] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] px-1 py-1 text-[var(--foreground)] transition-colors [font:inherit]"
    class:bg-[var(--primary)]={item.active}
    class:text-[var(--primary-foreground)]={item.active}
    class:hover:bg-[var(--surface-hover)]={!item.active}
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
        style:background="var(--success)"
      >
        {item.badge}
      </span>
    {/if}
  </button>
{/snippet}

{#if mobile}
  <nav
    class="flex w-full flex-none items-stretch gap-1 border-t border-[var(--border)] bg-[var(--panel)] px-1 pt-1 {className}"
    aria-label="Разделы приложения"
    data-testid="section-nav"
    data-mobile="true"
    style="padding-bottom: var(--safe-bottom);"
  >
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
        class="relative flex min-h-[var(--touch-target)] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] px-1 py-1"
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
  </nav>
{:else}
  <nav
    class="flex min-w-0 items-center gap-1 {className}"
    aria-label="Разделы приложения"
    data-testid="section-nav"
    data-mobile="false"
  >
    {#each sections as item (item.id)}
      {@render desktopTab(item)}
    {/each}
  </nav>
{/if}
