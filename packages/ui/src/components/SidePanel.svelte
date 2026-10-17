<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  /**
   * Общая боковая панель области.
   *
   * Единое строение панелей приложения: шапка с заголовком и действиями,
   * необязательный поиск и содержимое. Панели заметок, открытых вкладок и
   * уведомлений собираются из этого компонента, чтобы не расходиться по ширине,
   * отступам и состояниям. На узком окне панель занимает всю ширину области, а
   * на широком — ширину из общего значения (передаётся классом от потребителя).
   *
   * На узком окне к шапке добавляется кнопка закрытия: панель перекрывает
   * содержимое области, и без явного закрытия вернуться к нему нельзя жестом,
   * как на широком окне (где панель лишь сужает содержимое).
   */
  interface Props {
    /** Заголовок панели. */
    title: string;
    /** Значок рядом с заголовком (например, счётчик). */
    badge?: Snippet;
    /** Действия в шапке панели. */
    headerActions?: Snippet;
    /** Поле поиска под шапкой. */
    search?: Snippet;
    /** Показывать ли поиск (по умолчанию — да, если он передан). */
    showSearch?: boolean;
    /** Содержимое панели (список). */
    children?: Snippet;
    /** Закрытие панели; задаётся там, где панель перекрывает содержимое. */
    onClose?: () => void;
    /** Метка для тестов. */
    testId?: string;
    /** Дополнительные классы (ширина панели задаётся здесь). */
    class?: string;
  }

  let {
    title,
    badge,
    headerActions,
    search,
    showSearch = true,
    children,
    onClose,
    testId,
    class: className = '',
  }: Props = $props();
</script>

<aside
  class={cn(
    'flex h-full min-w-0 flex-none flex-col border-l border-[var(--border)] bg-[var(--panel)] max-lg:absolute max-lg:inset-0 max-lg:z-[var(--layer-panel)] max-lg:w-auto max-lg:border-l-0',
    className,
  )}
  data-testid={testId}
  style="padding-left: var(--safe-left); padding-right: var(--safe-right);"
>
  <div
    class="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--muted)] px-3 py-2.5"
  >
    {#if onClose}
      <span class="flex lg:hidden">
        <button
          type="button"
          class="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] transition-colors hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)] [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          title="Закрыть панель"
          aria-label="Закрыть панель"
          data-testid="side-panel-close"
          onclick={onClose}
        >
          <Icon name="chevron-left" />
        </button>
      </span>
    {/if}
    <span class="role-subtitle min-w-0 truncate text-[var(--foreground)]">{title}</span>
    {#if badge}
      {@render badge()}
    {/if}
    {#if headerActions}
      <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {@render headerActions()}
      </div>
    {/if}
  </div>
  {#if search && showSearch}
    <div class="border-b border-[var(--border)] p-2">{@render search()}</div>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col">{@render children?.()}</div>
</aside>
