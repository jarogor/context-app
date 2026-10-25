<script lang="ts">
  import { Icon, type IconName } from '@context/ui';

  /**
   * Навигация по разделам приложения — единственный источник переходов.
   *
   * Разделы всегда стоят в верхней панели: на широком окне — вкладками с
   * подписями, на узком — теми же кнопками без подписей (иконками). Отдельной
   * нижней полосы меню нет: она занимала высоту экрана и перекрывала обзор, а
   * те же действия доступны в шапке.
   */
  interface Props {
    /** Открыт ли список рабочих мест. */
    workspaceActive: boolean;
    /** Открыт ли раздел «Библиотеки». */
    libraryActive: boolean;
    /** Открыт ли раздел «Заметки». */
    notesActive: boolean;
    /** Компактная компоновка: только иконки, без подписей. */
    mobile: boolean;
    /** Выбор раздела «Рабочие места». */
    onWorkspace: () => void;
    /** Выбор раздела «Библиотеки». */
    onLibrary: () => void;
    /** Выбор раздела «Заметки». */
    onNotes: () => void;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    workspaceActive,
    libraryActive,
    notesActive,
    mobile,
    onWorkspace,
    onLibrary,
    onNotes,
    class: className = '',
  }: Props = $props();

  /** Разделы приложения в порядке показа. */
  const sections: Array<{ id: string; label: string; icon: IconName; active: boolean }> = $derived([
    { id: 'workspace', label: 'Рабочее место', icon: 'workspace', active: workspaceActive },
    { id: 'library', label: 'Библиотека', icon: 'library', active: libraryActive },
    { id: 'notes', label: 'Заметки', icon: 'note', active: notesActive },
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

{#snippet sectionTab(item: { id: string; label: string; icon: IconName; active: boolean })}
  <!--
    Все кнопки верхнего меню — одного цвета: разделы, уведомления, тема и
    настройки берут один приглушённый тон, поэтому шапка читается единым рядом
    действий. Активный раздел выделяется мягким фоном и основным цветом текста —
    так же, как активная кнопка панели уведомлений или настроек.
  -->
  <button
    type="button"
    class="flex min-w-0 shrink cursor-pointer items-center gap-2 rounded-[var(--radius)] transition-colors [font:inherit] {item.active
      ? 'bg-[var(--primary-soft)] text-[var(--foreground)]'
      : 'text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'} {mobile
      ? 'h-9 w-9 justify-center'
      : 'px-2 py-1.5 md:px-3'}"
    aria-pressed={item.active}
    aria-label={item.label}
    title={item.label}
    data-testid={`nav-${item.id}`}
    onclick={() => selectSection(item.id)}
  >
    <Icon name={item.icon} class="h-[1.15rem] w-[1.15rem]" />
    {#if !mobile}
      <span class="min-w-0 truncate role-subtitle">{item.label}</span>
    {/if}
  </button>
{/snippet}

<nav
  class="flex min-w-0 items-center gap-0.5 overflow-hidden {className} md:gap-1"
  aria-label="Разделы приложения"
  data-testid="section-nav"
  data-mobile={mobile ? 'true' : 'false'}
>
  {#each sections as item (item.id)}
    {@render sectionTab(item)}
  {/each}
</nav>
