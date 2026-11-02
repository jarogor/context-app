<script lang="ts">
  import type { Snippet } from 'svelte';
  import { t } from '@context/i18n';
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  /**
   * Общая боковая панель области.
   *
   * Единое строение панелей приложения: шапка с заголовком и действиями,
   * необязательный поиск и содержимое. На узком окне панель занимает всю ширину
   * области и получает кнопку закрытия; на широком — свою ширину (классом
   * потребителя) и остаётся на месте содержимого рядом с ним.
   */
  interface Props {
    /** Заголовок панели. */
    title: string;
    /** Значок рядом с заголовком (например, счётчик). */
    badge?: Snippet;
    /** Действия в шапке панели. */
    headerActions?: Snippet;
    /** Поле поиска под полосой вкладок. */
    search?: Snippet;
    /** Полоса вкладок панели: стоит над поиском и не сдвигается им. */
    tabs?: Snippet;
    /** Показывать ли поиск (по умолчанию — да, если он передан). */
    showSearch?: boolean;
    /** Содержимое панели (список). */
    children?: Snippet;
    /** Закрытие панели; задаётся там, где панель перекрывает содержимое. */
    onClose?: () => void;
    /** Метка для тестов. */
    testId?: string;
    /** Сторона панели относительно содержимого: справа (по умолчанию) или слева. */
    side?: 'left' | 'right';
    /** Дополнительные классы (ширина панели задаётся здесь). */
    class?: string;
  }

  let {
    title,
    badge,
    headerActions,
    search,
    tabs,
    showSearch = true,
    children,
    onClose,
    testId,
    side = 'right',
    class: className = '',
  }: Props = $props();

  /** Классы границы: панель справа отделена слева, панель слева — справа. */
  const borderClass = $derived(
    side === 'left'
      ? 'border-r max-lg:border-r-0'
      : 'border-l max-lg:border-l-0',
  );
</script>

<aside
  class={cn(
    'flex h-full min-w-0 flex-none flex-col border-[var(--border)] bg-[var(--panel)] max-lg:absolute max-lg:inset-0 max-lg:z-[var(--layer-panel)] max-lg:w-auto',
    borderClass,
    className,
  )}
  data-side={side}
  data-testid={testId}
  style="padding-left: var(--safe-left); padding-right: var(--safe-right);"
>
  <div
    class="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
  >
    {#if onClose}
      <span class="flex lg:hidden">
        <button
          type="button"
          class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          title={t('app.sidePanel.close')}
          aria-label={t('app.sidePanel.close')}
          data-testid="side-panel-close"
          onclick={onClose}
        >
          <Icon name={side === 'left' ? 'chevron-right' : 'chevron-left'} />
        </button>
      </span>
    {/if}
    <span class="role-heading min-w-0 truncate text-[var(--foreground)]">{title}</span>
    {#if badge}
      {@render badge()}
    {/if}
    {#if headerActions}
      <div class="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        {@render headerActions()}
      </div>
    {/if}
  </div>
  <!--
    Полоса вкладок панели стоит **над** поиском и не зависит от него: у
    раздела без поиска основание вкладок не сдвигается, и нажатие на вкладку
    не переставляет саму панель. Полоса держит постоянную высоту, а её
    собственные вкладки переносятся внутри неё, не меняя места.
  -->
  {#if tabs}
    <div class="border-b border-[var(--border)] bg-[var(--panel)] px-2 py-1.5">
      {@render tabs()}
    </div>
  {/if}
  <!--
    Поиск — отдельная полоса постоянной высоты: у раздела с поиском она есть,
    у раздела без него её нет, но вкладки от этого не переезжают, потому что
    стоят выше.
  -->
  {#if search && showSearch}
    <div class="border-b border-[var(--border)] p-2">{@render search()}</div>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col">{@render children?.()}</div>
</aside>
