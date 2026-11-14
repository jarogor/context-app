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
   *
   * Где ставить панель рядом, а где поверх, решает потребитель: в области
   * чтения это зависит от ширины **области**, а не окна, поэтому панель там
   * не слушает ширину окна вовсе (`responsive={false}`).
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
    /** Панель накрывает содержимое, а не стоит рядом с ним.
     *
     * Задаёт тот, кто знает ширину области, а не окна: панель перекрывает
     * книгу, когда рядом с ней тексту не остаётся места для чтения.
     */
    overlay?: boolean;
    /** Слушать ли ширину окна: ниже `large-tablet` панель становится накладной.
     *
     * Так ведут себя разделы библиотеки и заметок. Область чтения выключает
     * это: её панели подчиняются ширине области, а не окна.
     */
    responsive?: boolean;
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
    overlay = false,
    responsive = true,
    class: className = '',
  }: Props = $props();

  /** Классы границы: панель справа отделена слева, панель слева — справа. */
  const borderClass = $derived(
    side === 'left'
      ? 'border-r max-large-tablet:border-r-0'
      : 'border-l max-large-tablet:border-l-0',
  );

  /**
   * Классы накладной панели.
   *
   * Накладная панель не занимает места в раскладке, но и не растягивается на
   * всю область: она встаёт над книгой у своей стороны и держит ширину
   * потребителя. Так панели с обеих сторон не накрывают друг друга, а книга
   * остаётся видимой между ними.
   *
   * Нижняя граница — высота строки книги: строка остаётся доступной, пока
   * панель открыта, иначе её собственный переключатель оказался бы под панелью
   * и закрыть панель было бы нечем, кроме крестика. `h-full` из общего набора
   * здесь не годится: при заданной высоте нижняя граница игнорируется.
   */
  const overlayClass = $derived(
    cn(
      'absolute z-[var(--layer-panel)]',
      side === 'left' ? 'left-0' : 'right-0',
      'top-0 bottom-[var(--book-bar-height)] h-auto',
      // На узком окне панель занимает всю ширину области. Ширина задаётся
      // шириной, а не парой `left`/`right`: при заданной ширине второе из них
      // игнорируется, и панель с правой стороны встала бы слева.
      'max-large-tablet:w-full max-large-tablet:top-0 max-large-tablet:bottom-[var(--book-bar-height)]',
    ),
  );

  /** Классы положения: накладная панель либо обычная в потоке раскладки. */
  const positionClass = $derived(
    overlay
      ? overlayClass
      : responsive
        ? 'max-large-tablet:absolute max-large-tablet:inset-0 max-large-tablet:z-[var(--layer-panel)] max-large-tablet:w-auto'
        : '',
  );

  /** Показывать ли крестик: у накладной панели он нужен всегда. */
  const showClose = $derived(overlay || responsive);
</script>

<aside
  class={cn(
    'flex h-full min-w-0 flex-none flex-col border-[var(--border)] bg-[var(--panel)]',
    positionClass,
    borderClass,
    className,
  )}
  data-side={side}
  data-overlay={overlay ? 'true' : 'false'}
  data-testid={testId}
  style="padding-left: var(--safe-left); padding-right: var(--safe-right);"
>
  <div
    class="flex flex-wrap items-center gap-2 border-b border-[var(--border)] bg-[var(--panel)] px-3 py-2.5"
  >
    {#if onClose && showClose}
      <span class={cn('flex', !overlay && 'large-tablet:hidden')}>
        <button
          type="button"
          class="text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)] flex h-8 w-8 cursor-pointer items-center justify-center rounded-[var(--radius)] transition-colors [font:inherit] pointer-coarse:h-11 pointer-coarse:w-11"
          title={t('app.sidePanel.close')}
          aria-label={t('app.sidePanel.close')}
          data-testid="side-panel-close"
          onclick={onClose}
        >
          <Icon name="close" />
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
