<script lang="ts">
  import { Icon, type IconName } from '@context/ui';
  import { t } from '@context/i18n';

  /**
   * Навигация по разделам приложения — единственный источник переходов.
   *
   * Две компоновки одного и того же меню, выбираемые шириной окна; в разметке
   * активна ровно одна:
   * - **широкое окно** — вкладки в верхней панели с подписями: раздел читается
   *   как закладка в книге, а акцентная заливка активной вкладки задаёт ось;
   * - **телефон** — нижняя навигация: те же разделы и служебные пункты иконками
   *   с короткими подписями, прижатая к нижнему краю и учитывающая безопасную
   *   зону экрана. Верхняя панель на телефоне разделов не рисует: одна
   *   компоновка меню, без дублирования разметки и доступных имён.
   */
  interface Props {
    /** Открыт ли список рабочих мест. */
    workspaceActive: boolean;
    /** Открыт ли раздел «Библиотеки». */
    libraryActive: boolean;
    /** Открыт ли раздел «Заметки». */
    notesActive: boolean;
    /** Открыт ли раздел настроек (телефонная компоновка). */
    settingsOpen?: boolean;
    /** Число замечаний (телефонная компоновка). */
    alertCount?: number;
    /** Тексты замечаний для подсказки индикатора (телефонная компоновка). */
    alertTitles?: string;
    /** Есть ли замечания-ошибки (телефонная компоновка). */
    alertError?: boolean;
    /** Показанная сейчас сторона темы (телефонная компоновка). */
    theme?: 'light' | 'dark';
    /** Сторона, которую поставит нажатие кнопки темы (телефонная компоновка). */
    themeNext?: 'light' | 'dark';
    /** Телефонная компоновка: нижняя навигация вместо вкладок. */
    mobile: boolean;
    /** Выбор раздела «Рабочие места». */
    onWorkspace: () => void;
    /** Выбор раздела «Библиотеки». */
    onLibrary: () => void;
    /** Выбор раздела «Заметки». */
    onNotes: () => void;
    /** Открытие раздела настроек (телефонная компоновка). */
    onSettings?: () => void;
    /** Переключение темы (телефонная компоновка). */
    onTheme?: () => void;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    workspaceActive,
    libraryActive,
    notesActive,
    settingsOpen = false,
    alertCount = 0,
    alertTitles = '',
    alertError = false,
    theme = 'light',
    themeNext = 'dark',
    mobile,
    onWorkspace,
    onLibrary,
    onNotes,
    onSettings,
    onTheme,
    class: className = '',
  }: Props = $props();

  /** Разделы приложения в порядке показа. */
  const sections: Array<{ id: string; label: string; short: string; icon: IconName; active: boolean }> =
    $derived([
      {
        id: 'workspace',
        label: t('app.section.workspace'),
        short: t('app.section.workspace.short'),
        icon: 'workspace',
        active: workspaceActive,
      },
      {
        id: 'library',
        label: t('app.section.library'),
        short: t('app.section.library.short'),
        icon: 'library',
        active: libraryActive,
      },
      {
        id: 'notes',
        label: t('app.section.notes'),
        short: t('app.section.notes.short'),
        icon: 'note',
        active: notesActive,
      },
    ]);

  /** Иконка кнопки темы: показывает текущую сторону темы. */
  const themeIcon: IconName = $derived(theme === 'dark' ? 'moon' : 'sun');

  /** Подпись кнопки темы: называет сторону, на которую она переключит. */
  const themeLabel = $derived(
    themeNext === 'dark' ? t('app.theme.toDark') : t('app.theme.toLight'),
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

{#snippet sectionTab(item: { id: string; label: string; icon: IconName; active: boolean })}
  <!--
    Все кнопки меню — одного цвета в покое: разделы, тема и настройки берут один
    приглушённый тон, поэтому панель читается единым рядом действий.
    Активный раздел выделяется **той же плотной акцентной заливкой**, что и
    активная вкладка книги: одно выделение на всё приложение, без второго
    «своего» цвета у меню.
  -->
  <button
    type="button"
    class="flex min-w-0 shrink cursor-pointer items-center gap-2 rounded-[var(--radius)] transition-colors [font:inherit] {item.active
      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
      : 'text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'} px-2 py-1.5 md:px-3"
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
  title: string;
  icon: IconName;
  active: boolean;
  onClick: () => void;
})}
  <button
    type="button"
    class="relative flex min-h-[var(--touch-target)] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] px-1 py-1 transition-colors [font:inherit] {item.active
      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
      : 'text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'}"
    aria-pressed={item.active}
    aria-label={item.title}
    title={item.title}
    data-testid={`nav-${item.id}`}
    onclick={item.onClick}
  >
    <Icon name={item.icon} class="h-[1.375rem] w-[1.375rem]" />
    <span class="hidden min-[34rem]:inline role-caption leading-none">{item.label}</span>
  </button>
{/snippet}

{#if mobile}
  <!--
    Нижняя навигация телефона: те же разделы и служебные действия, что и в
    верхней панели, но прижатые к нижнему краю и удобные пальцу. Высота — от
    цели `--touch-target`, снизу добавляется безопасная зона экрана. Верхняя
    панель на телефоне это меню не дублирует.
  -->
  <nav
    class="flex w-full flex-none items-stretch gap-1 border-t border-[var(--border)] bg-[var(--panel)] px-1 pt-1 {className}"
    aria-label={t('app.sections.label')}
    data-testid="section-nav"
    data-mobile="true"
    style="padding-bottom: max(0.25rem, var(--safe-bottom));"
  >
    {#each sections as item (item.id)}
      {@render mobileTab({
        id: item.id,
        label: item.short,
        title: item.label,
        icon: item.icon,
        active: item.active,
        onClick: () => selectSection(item.id),
      })}
    {/each}

    {#if alertCount > 0}
      <span
        class="relative flex min-h-[var(--touch-target)] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--radius)] px-1 py-1"
        role="status"
        data-testid="header-alerts"
        title={alertTitles}
        aria-label={t('app.alerts', { count: alertCount })}
        style:color={alertError ? 'var(--destructive)' : 'var(--warning)'}
      >
        <span class="flex h-[1.375rem] items-center justify-center role-title">{alertCount}</span>
        <span class="hidden min-[34rem]:inline role-caption leading-none"
          >{t('app.alerts.short')}</span
        >
      </span>
    {/if}

    {@render mobileTab({
      id: 'theme',
      label: t('app.theme.short'),
      title: themeLabel,
      icon: themeIcon,
      active: false,
      onClick: () => onTheme?.(),
    })}

    {@render mobileTab({
      id: 'settings',
      label: t('app.settings.short'),
      title: t('app.settings'),
      icon: 'menu',
      active: settingsOpen,
      onClick: () => onSettings?.(),
    })}
  </nav>
{:else}
  <nav
    class="flex min-w-0 items-center gap-0.5 overflow-hidden {className} md:gap-1"
    aria-label={t('app.sections.label')}
    data-testid="section-nav"
    data-mobile="false"
  >
    {#each sections as item (item.id)}
      {@render sectionTab(item)}
    {/each}
  </nav>
{/if}
