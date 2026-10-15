<script lang="ts">
  import { Button, Input, Progress } from '@texture/ui';

  interface Props {
    /** Читается ли книга плагином рабочего места. */
    workplace: boolean;
    /** Поддерживает ли плагин страницы. */
    workplacePages: boolean;
    /** Текущая страница плагина или `null`. */
    workplacePage: number | null;
    /** Общее число страниц плагина или `null`. */
    workplacePageCount: number | null;
    /** Прогресс чтения в процентах. */
    progress: number;
    /** Переход к соседней странице. */
    onStepPage: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage: (page: number) => void;
  }

  let {
    workplace,
    workplacePages,
    workplacePage,
    workplacePageCount,
    progress,
    onStepPage,
    onGoToPage,
  }: Props = $props();

  /** Черновик правки поля текущей страницы; `null` — поле показывает снимок. */
  let pageDraft = $state<string | null>(null);

  /**
   * Видимое значение поля страницы.
   *
   * Пока пользователь не правит поле, значение берётся из снимка текущей
   * страницы и следует за листанием; во время правки показывается черновик.
   */
  const pageValue = $derived(pageDraft ?? (workplacePage === null ? '' : String(workplacePage)));

  /** Переход к введённому номеру страницы.
   *
   * Пустой и нечисловой ввод игнорируется, а поле возвращается к текущей
   * странице из снимка.
   */
  function commitPage() {
    const draft = pageDraft?.trim();
    if (draft !== undefined && draft !== '') {
      const page = Number(draft);
      if (Number.isInteger(page) && page >= 1) {
        onGoToPage(page);
      }
    }
    pageDraft = null;
  }
</script>

<!--
  Нижняя панель рабочего места: навигация по страницам и прогресс чтения.
  Управление масштабом и переключатель темы области чтения вынесены в верхнюю
  панель чтения, поэтому здесь их нет.
-->
<footer
  class="flex flex-[0_0_40px] items-center gap-4 border-t border-[var(--border)] bg-[var(--card)] px-4 text-[0.75rem] text-[var(--muted-foreground)]"
  data-testid="reader-footer"
>
  <div class="ml-auto flex items-center gap-2">
    {#if workplace && workplacePages && workplacePage !== null}
      <div
        class="flex shrink-0 items-center gap-1 whitespace-nowrap"
        data-testid="reader-pages"
      >
        <Button
          size="icon"
          variant="ghost"
          title="Предыдущая страница"
          ariaLabel="Предыдущая страница"
          disabled={workplacePage <= 1}
          onclick={() => onStepPage(-1)}>‹</Button
        >
        <Input
          class="h-6 w-[3.5rem] shrink-0 px-1 py-0 text-center"
          ariaLabel="Текущая страница"
          value={pageValue}
          oninput={(event) => (pageDraft = event.currentTarget.value)}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              commitPage();
            }
          }}
          onblur={commitPage}
        />
        <span class="whitespace-nowrap" data-testid="reader-page-count"
          >/ {workplacePageCount ?? '?'}</span
        >
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
    <span class="whitespace-nowrap" data-testid="reader-progress">{Math.round(progress)}%</span>
    <Progress value={progress} class="w-[11.25rem] max-[899px]:hidden" />
  </div>
</footer>
