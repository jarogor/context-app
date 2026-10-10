<script lang="ts">
  import { Button, Icon, Progress } from '@texture/ui';
  import type { ReaderThemeId } from '@texture/ui';

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
    /** Текущая тема области чтения. */
    readerTheme: ReaderThemeId;
    /** Изменение масштаба на заданную величину. */
    onChangeZoom: (delta: number) => void;
    /** Переход к соседней странице. */
    onStepPage: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage: () => void;
    /** Смена темы области чтения. */
    onChangeReaderTheme: (theme: ReaderThemeId) => void;
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
    readerTheme,
    onChangeZoom,
    onStepPage,
    onGoToPage,
    onChangeReaderTheme,
  }: Props = $props();
</script>

<footer
  class="flex flex-[0_0_40px] items-center gap-4 border-t border-[var(--border)] bg-[var(--card)] px-4 text-[12px] text-[var(--muted-foreground)]"
  data-testid="reader-footer"
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
  <div class="flex items-center gap-1" data-testid="reader-theme-toggle">
    <Button
      size="icon"
      variant={readerTheme === 'light' ? 'secondary' : 'ghost'}
      title="Светлая тема области чтения"
      ariaLabel="Светлая тема области чтения"
      ariaPressed={readerTheme === 'light'}
      onclick={() => onChangeReaderTheme('light')}
    >
      <Icon name="sun" />
    </Button>
    <Button
      size="icon"
      variant={readerTheme === 'dark' ? 'secondary' : 'ghost'}
      title="Тёмная тема области чтения"
      ariaLabel="Тёмная тема области чтения"
      ariaPressed={readerTheme === 'dark'}
      onclick={() => onChangeReaderTheme('dark')}
    >
      <Icon name="moon" />
    </Button>
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
