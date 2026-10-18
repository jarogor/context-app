<script lang="ts">
  import { Icon, type IconName } from '@texture/ui';
  import SectionNav from './SectionNav.svelte';

  /**
   * Верхняя панель приложения — постоянный «корешок» оболочки.
   *
   * Слева — название приложения и навигационный текст: где находится
   * пользователь и что выбрано (раздел или имя открытого рабочего места). Справа
   * — меню разделов и служебные действия: индикатор замечаний, лента уведомлений,
   * переключатель темы и настройки. Панель не прокручивается и держит разделы
   * всегда доступными. На телефоне она сжимается до названия и действий, а
   * разделы переезжают в нижнюю навигацию.
   */
  interface Props {
    /** Навигационный текст: где находится пользователь и что выбрано. */
    context: string;
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
    /** Телефонная компоновка: разделы уходят в нижнюю навигацию. */
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
  }

  let {
    context,
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
  }: Props = $props();

  /** Иконка переключателя темы по предпочтению. */
  const themeIcon: IconName = $derived(
    themeTitle === 'Светлая' ? 'sun' : themeTitle === 'Тёмная' ? 'moon' : 'monitor',
  );
</script>

<header
  class="flex flex-none items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3 md:gap-4 md:px-4"
  style="min-height: var(--app-bar-height); padding-top: var(--safe-top);"
  data-testid="app-bar"
>
  <!--
    Название приложения — надпись, а не кнопка. Рядом — навигационный текст: где
    находится пользователь и что выбрано. Отдельной панели раздела под шапкой нет:
    она дублировала этот текст и меняла высоту при смене раздела.
  -->
  <span
    class="shrink-0 role-heading tracking-tight text-[var(--foreground)]"
    data-testid="app-name"
  >
    Текстура
  </span>
  <span class="hidden h-6 w-px shrink-0 bg-[var(--border)] md:block" aria-hidden="true"></span>
  <span
    class="min-w-0 truncate role-caption text-[var(--muted-foreground)]"
    data-testid="app-context"
    title={context}
  >
    {context}
  </span>

  <div class="ml-auto flex min-w-0 shrink items-center gap-2 md:gap-4">
    {#if !mobile}
      <SectionNav
        {workspaceActive}
        {libraryActive}
        {notesActive}
        {notificationsOpen}
        {settingsOpen}
        {unreadCount}
        {alertCount}
        {alertTitles}
        {alertError}
        {themeTitle}
        mobile={false}
        {onWorkspace}
        {onLibrary}
        {onNotes}
        {onNotifications}
        {onSettings}
        {onTheme}
      />
    {/if}

    <div class="flex shrink-0 items-center gap-1">
      {#if alertCount > 0}
        <span
          class="flex h-8 min-w-8 items-center justify-center rounded-full px-2 role-caption"
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

      {#if !mobile}
        <span class="relative flex">
          <button
            type="button"
            class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
            class:bg-[var(--primary-soft)]={notificationsOpen}
            title="Уведомления"
            aria-label="Уведомления"
            aria-pressed={notificationsOpen}
            data-testid="nav-notifications"
            onclick={onNotifications}
          >
            <Icon name="bell" class="h-[1.15rem] w-[1.15rem]" />
          </button>
          {#if unreadCount > 0}
            <span
              class="pointer-events-none absolute -top-0.5 right-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[0.625rem] leading-none text-[var(--primary-foreground)]"
              style:background="var(--success)"
              aria-hidden="true"
            >
              {unreadCount}
            </span>
          {/if}
        </span>

        <button
          type="button"
          class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          title={`Тема: ${themeTitle}`}
          aria-label="Переключить тему"
          data-testid="nav-theme"
          onclick={onTheme}
        >
          <Icon name={themeIcon} class="h-[1.15rem] w-[1.15rem]" />
        </button>

        <button
          type="button"
          class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-9 w-9 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          class:bg-[var(--primary-soft)]={settingsOpen}
          title="Настройки"
          aria-label="Настройки"
          aria-pressed={settingsOpen}
          data-testid="nav-settings"
          onclick={onSettings}
        >
          <Icon name="menu" class="h-[1.15rem] w-[1.15rem]" />
        </button>
      {/if}
    </div>
  </div>
</header>
