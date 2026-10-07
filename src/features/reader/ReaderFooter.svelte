<script lang="ts">
  import { Button, Progress } from '@texture/ui';

  interface Props {
    /** Текущий масштаб текста в процентах. */
    zoom: number;
    /** Нижняя граница масштаба. */
    minZoom: number;
    /** Верхняя граница масштаба. */
    maxZoom: number;
    /** Читается ли книга плагином рабочего места. */
    workplace: boolean;
    /** Поддерживает ли плагин изменение масштаба. */
    workplaceZoom: boolean;
    /** Поддерживает ли плагин страницы. */
    workplacePages: boolean;
    /** Текущая страница плагина или `null`. */
    workplacePage: number | null;
    /** Общее число страниц плагина или `null`. */
    workplacePageCount: number | null;
    /** Введённый номер страницы для перехода (двусторонняя привязка). */
    pageInput?: string;
    /** Прогресс чтения в процентах. */
    progress: number;
    /** Изменение масштаба на заданную величину. */
    onChangeZoom: (delta: number) => void;
    /** Переход к соседней странице. */
    onStepPage: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage: () => void;
  }

  let {
    zoom,
    minZoom,
    maxZoom,
    workplace,
    workplaceZoom,
    workplacePages,
    workplacePage,
    workplacePageCount,
    pageInput = $bindable(''),
    progress,
    onChangeZoom,
    onStepPage,
    onGoToPage,
  }: Props = $props();
</script>

<footer
  class="flex flex-[0_0_40px] items-center gap-4 border-t border-[var(--border)] bg-[var(--card)] px-4 text-[12px] text-[var(--muted-foreground)]"
>
  <div class="flex items-center gap-1">
    {#if !workplace || workplaceZoom}
      <Button
        size="icon"
        variant="ghost"
        title="Уменьшить масштаб"
        ariaLabel="Уменьшить масштаб"
        disabled={zoom <= minZoom}
        onclick={() => onChangeZoom(-10)}>−</Button
      >
      <span class="min-w-[48px] text-center" data-testid="reader-zoom">{zoom}%</span>
      <Button
        size="icon"
        variant="ghost"
        title="Увеличить масштаб"
        ariaLabel="Увеличить масштаб"
        disabled={zoom >= maxZoom}
        onclick={() => onChangeZoom(10)}>+</Button
      >
    {/if}
  </div>
  <div class="ml-auto flex items-center gap-2">
    {#if workplace && workplacePages && workplacePage !== null}
      <div class="flex items-center gap-1" data-testid="reader-pages">
        <Button
          size="icon"
          variant="ghost"
          title="Предыдущая страница"
          ariaLabel="Предыдущая страница"
          disabled={workplacePage <= 1}
          onclick={() => onStepPage(-1)}>‹</Button
        >
        <span class="min-w-[16px] text-center" data-testid="reader-page">{workplacePage}</span>
        <span data-testid="reader-page-count">из {workplacePageCount ?? '?'}</span>
        <input
          class="w-[52px] rounded-sm border border-[var(--border)] bg-[var(--card)] px-[6px] py-[2px] text-center text-[12px] text-[var(--foreground)]"
          aria-label="Перейти к странице"
          placeholder="№"
          bind:value={pageInput}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              onGoToPage();
            }
          }}
          onblur={onGoToPage}
        />
        <Button
          size="icon"
          variant="ghost"
          title="Следующая страница"
          ariaLabel="Следующая страница"
          disabled={workplacePageCount !== null && workplacePage >= workplacePageCount}
          onclick={() => onStepPage(1)}>›</Button
        >
      </div>
    {/if}
    <span data-testid="reader-progress">{Math.round(progress)}%</span>
    <Progress value={progress} class="w-[180px]" />
  </div>
</footer>
