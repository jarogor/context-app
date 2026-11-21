<script lang="ts">
  import { t } from '@context/i18n';
  import { Button, Icon, Input, PathField } from '@context/ui';
  import { hotkeyHint } from '../hotkeys/registry';

  /**
   * Строка книги — управление чтением под текстом.
   *
   * Строка стоит под панелями и книгой во всю ширину рабочего места, поэтому
   * открытие панели не меняет её места и не сдвигает кнопки из-под курсора.
   *
   * Порядок — по тому, как читают: слева меню и действия над текстом (поиск,
   * инструмент заметки, шрифт), справа — управление положением и видом книги
   * (страницы или прогресс, масштаб, тема). Ближе к правому краю то, что
   * меняют реже.
   */

  interface Props {
    /** Поддерживает ли формат страницы. */
    pages?: boolean;
    /** Текущая страница или `null`. */
    page?: number | null;
    /** Общее число страниц или `null`. */
    pageCount?: number | null;
    /** Прогресс чтения в процентах (у страничных не показывается). */
    progress?: number;
    /** Текущий масштаб в процентах. */
    zoom?: number;
    /** Нижняя граница масштаба. */
    minZoom?: number;
    /** Верхняя граница масштаба. */
    maxZoom?: number;
    /** Поддерживает ли формат изменение масштаба. */
    showZoom?: boolean;
    /** Путь к файлу книги: стоит в начале строки вместо действий. */
    path?: string;
    /** Текущая тема области чтения. */
    readerTheme?: 'light' | 'dark';
    /** Переключение темы области чтения. */
    onToggleTheme?: () => void;
    /** Переход к соседней странице. */
    onStepPage?: (delta: number) => void;
    /** Переход к введённому номеру страницы. */
    onGoToPage?: (page: number) => void;
    /** Изменение масштаба на шаг шкалы. */
    onStepZoom?: (direction: 1 | -1) => void;
  }

  let {
    pages = false,
    page = null,
    pageCount = null,
    progress = 0,
    zoom = 100,
    minZoom = 60,
    maxZoom = 220,
    showZoom = true,
    path = '',
    readerTheme = 'light',
    onToggleTheme,
    onStepPage,
    onGoToPage,
    onStepZoom,
  }: Props = $props();

  /** Ширина строки: по ней убираются второстепенные действия, но строка не переносится. */
  let barWidth = $state(0);

  /** Элемент строки для измерения ширины. */
  let bar: HTMLDivElement | undefined = $state();

  /** Узко: поиск и шрифт уходят в меню; номер страницы становится подписью. */
  const narrow = $derived(barWidth > 0 && barWidth < 34 * 16);

  /** Слежение за шириной строки. */
  $effect(() => {
    const el = bar;
    if (!el) {
      return;
    }
    let frame = 0;
    const apply = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        barWidth = el.clientWidth;
      });
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  /** Черновик поля номера страницы; `null` — поле показывает текущую страницу. */
  let pageDraft = $state<string | null>(null);

  /** Видимое значение поля страницы. */
  const pageValue = $derived(pageDraft ?? (page === null ? '' : String(page)));
  /** Переход к введённому номеру страницы. */
  function commitPage() {
    const draft = pageDraft?.trim();
    if (draft !== undefined && draft !== '') {
      const value = Number(draft);
      if (Number.isInteger(value) && value >= 1) {
        onGoToPage?.(value);
      }
    }
    pageDraft = null;
  }

  /** Подпись кнопки темы: называет сторону, на которую она переключит. */
  const themeTitle = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.toLight') : t('app.theme.reader.toDark'),
  );

  /** Доступное имя кнопки темы: называет текущую сторону, как у значка. */
  const themeLabel = $derived(
    readerTheme === 'dark' ? t('app.theme.reader.light') : t('app.theme.reader.dark'),
  );
</script>

<div
  bind:this={bar}
  class="flex h-[var(--book-bar-height)] flex-none flex-nowrap items-center gap-1 overflow-hidden bg-[var(--card)] px-1.5 text-sm [font-variant-numeric:tabular-nums] large-tablet:gap-1.5 large-tablet:px-2"
  data-testid="book-bar"
  role="toolbar"
  aria-label={t('app.bookBar.label')}
>
  <!--
    Слева — путь к открытому файлу: та же врезка с копированием, что на странице
    книги в библиотеке. Свой показ пути здесь не повторяется — адрес должен
    выглядеть и вести себя одинаково везде.

    Действия над текстом (поиск, инструмент заметки, гарнитура) переехали на
    панель активной вкладки: это работа с книгой целиком, и ей там место.
  -->
  <PathField
    value={path}
    class="min-w-0 flex-1"
    testId="book-bar-path"
  />

  <!--
    Справа — положение и вид книги: страницы или прогресс, масштаб, тема.
    Прогресс текучей книги стоит там же, где у страничной номер страницы:
    это одно и то же место «где я», просто у текучей книги его нечем считать
    по страницам.
  -->
  {#if pages && page !== null}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
      data-testid="reader-pages"
    >
      <Button
        size="icon"
        variant="ghost"
        title={t('app.reader.prevPage')}
        ariaLabel={t('app.reader.prevPage')}
        class="size-8"
        disabled={page <= 1}
        onclick={() => onStepPage?.(-1)}
      >
        <Icon name="chevron-up" />
      </Button>
      {#if narrow}
        <span class="px-1 text-sm whitespace-nowrap" data-testid="reader-page-count">
          {page} / {pageCount ?? '?'}
        </span>
      {:else}
        <Input
          class="h-8 w-[calc(var(--spacing)*14)] shrink-0 border-0 bg-transparent px-1 py-0 text-right text-sm"
          ariaLabel={t('app.reader.currentPage')}
          value={pageValue}
          oninput={(event) => (pageDraft = event.currentTarget.value)}
          onkeydown={(event) => {
            if (event.key === 'Enter') {
              commitPage();
            }
          }}
          onblur={commitPage}
        />
        <span
          class="inline-block min-w-[calc(var(--spacing)*12)] shrink-0 pr-2 whitespace-nowrap text-left text-sm"
          data-testid="reader-page-count"
          >/ {pageCount ?? '?'}</span
        >
      {/if}
      <Button
        size="icon"
        variant="ghost"
        title={t('app.reader.nextPage')}
        ariaLabel={t('app.reader.nextPage')}
        class="size-8"
        disabled={pageCount !== null && page >= pageCount}
        onclick={() => onStepPage?.(1)}
      >
        <Icon name="chevron-down" />
      </Button>
    </div>
  {:else}
    <!--
      Прогресс показывается у книг без страниц, в том числе пока формат ещё не
      сообщил свои возможности: это место «где я», и пустым оно быть не должно.
    -->
    <span
      class="inline-block w-[calc(var(--spacing)*11)] shrink-0 text-right whitespace-nowrap text-sm text-[var(--muted-foreground)]"
      data-testid="reader-progress"
      >{Math.round(progress)}%</span
    >
  {/if}

  {#if showZoom}
    <div
      class="flex shrink-0 items-center gap-0.5 rounded-[var(--radius)] bg-[var(--control-surface)] p-0.5"
      data-testid="reader-zoom-group"
    >
      <Button
        size="icon"
        variant="ghost"
        title={hotkeyHint('reader.zoom.out', t('app.reader.zoomOut'))}
        ariaLabel={t('app.reader.zoomOut')}
        class="size-8"
        disabled={zoom <= minZoom}
        onclick={() => onStepZoom?.(-1)}>−</Button
      >
      <Button
        size="icon"
        variant="ghost"
        title={hotkeyHint('reader.zoom.in', t('app.reader.zoomIn'))}
        ariaLabel={t('app.reader.zoomIn')}
        class="size-8"
        disabled={zoom >= maxZoom}
        onclick={() => onStepZoom?.(1)}>+</Button
      >
      <span class="inline-block w-[calc(var(--spacing)*13)] text-center text-sm" data-testid="reader-zoom"
        >{zoom}%</span
      >
    </div>
  {/if}

  {#if onToggleTheme}
    <Button
      size="icon"
      variant="ghost"
      title={themeTitle}
      ariaLabel={themeLabel}
      testId="reader-theme-toggle"
      onclick={onToggleTheme}
    >
      <Icon name={readerTheme === 'dark' ? 'sun' : 'moon'} />
    </Button>
  {/if}</div>
