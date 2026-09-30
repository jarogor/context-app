<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, Progress, Spinner } from '@texture/ui';
  import BookReader from './BookReader.svelte';
  import WorkplaceContent from './WorkplaceContent.svelte';
  import {
    UnsupportedFormatError,
    formatFromPath,
    isSupportedFormat,
    loadBookContent,
    openBookExternally,
    selectWorkplacePlugin,
    type BookContent,
    type WorkplaceSelection,
  } from './reader';
  import type { Note } from './notes';
  import type { QuoteAnchor } from './reader/anchor';

  interface Props {
    /** Путь к файлу открытой книги (вложение вкладки). */
    path: string;
    /** Название открытой книги. */
    title: string;
    /** Начальный масштаб чтения в процентах. */
    initialZoom?: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Видима ли поверхность рабочего места. */
    visible?: boolean;
    /** Заметки-цитаты книги для подсветки. */
    notes?: Note[];
    /** Сообщение об изменении состояния чтения вкладки. */
    onStateChange?: (state: { zoom: number; position: number }) => void;
    /** Выделение пользователя, ставшее цитатой. */
    onQuote?: (anchor: QuoteAnchor) => void;
    /** Просьба указать файл недоступной книги. */
    onRepoint?: () => void;
    /** Убрать вкладку. */
    onRemove?: () => void;
  }

  let {
    path,
    title,
    initialZoom = 100,
    initialPosition = 0,
    visible = true,
    notes = [],
    onStateChange,
    onQuote,
    onRepoint,
    onRemove,
  }: Props = $props();

  /** Минимальный и максимальный масштаб текста в процентах. */
  const MIN_ZOOM = 60;
  const MAX_ZOOM = 220;

  /** Содержимое книги (текстовые форматы). */
  let content: BookContent | null = $state(null);
  /** Плагин рабочего места, если формат читается им. */
  let workplace: WorkplaceSelection | null = $state(null);
  /** Идёт загрузка содержимого. */
  let loading = $state(true);
  /** Ошибка загрузки содержимого. */
  let error: string | null = $state(null);
  /** Формат не поддерживается встроенным чтением. */
  let unsupported = $state(false);
  /** Книга недоступна: файл не читается или не найден. */
  let unavailable = $state(false);
  /** Масштаб текста в процентах (начальное значение берётся один раз). */
  let zoom = $state(untrack(() => initialZoom));
  /** Прогресс чтения в процентах. */
  let progress = $state(untrack(() => initialPosition));
  /** Поддерживает ли плагин рабочего места изменение масштаба. */
  let workplaceZoom = $state(true);
  /** Читалка текстовой книги для перехода к заметке. */
  let reader: { goto: (note: Note) => void } | undefined = $state();

  /** Сообщение об изменении состояния чтения вкладки. */
  function reportState() {
    onStateChange?.({ zoom, position: progress });
  }

  /** Загрузка содержимого книги.
   *
   * Рабочее место не знает, откуда книга: файл читается ядром по пути. Если
   * файл не найден или не читается, вкладка предлагает указать файл заново, а
   * не завершает работу.
   */
  async function load(value: string) {
    loading = true;
    error = null;
    unsupported = false;
    unavailable = false;
    content = null;
    workplace = null;
    try {
      const format = formatFromPath(value);
      if (!format) {
        unsupported = true;
        return;
      }
      if (isSupportedFormat(format)) {
        content = await loadBookContent(value);
      } else {
        const selection = await selectWorkplacePlugin(value);
        if (selection) {
          workplace = selection;
        } else {
          unsupported = true;
        }
      }
    } catch (e) {
      if (e instanceof UnsupportedFormatError) {
        unsupported = true;
      } else {
        unavailable = true;
        error = String(e);
      }
    } finally {
      loading = false;
    }
  }

  /** Изменение масштаба текста в допустимых границах. */
  function changeZoom(delta: number) {
    zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
    reportState();
  }

  /** Открытие файла книги в системном приложении. */
  async function openInSystem() {
    error = null;
    try {
      await openBookExternally(path);
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    void load(path);
  });

  /** Переход к месту заметки в тексте книги.
   *
   * Используется панелью заметок: чтение возвращается к выделению заметки.
   */
  export function goto(note: Note) {
    reader?.goto(note);
  }
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="min-h-0 flex-1 overflow-hidden">
    {#if loading}
      <div class="flex h-full items-center justify-center gap-[var(--space-2)] text-[var(--color-text-muted)]">
        <Spinner />
        <span>Открытие книги…</span>
      </div>
    {:else if unavailable}
      <div
        class="mx-auto max-w-[560px] p-[var(--space-5)] text-center"
        data-testid="reader-unavailable"
      >
        <p class="mb-[var(--space-2)] font-semibold">{title}</p>
        <p class="mb-[var(--space-4)] text-[var(--color-text-muted)]">
          Книга недоступна: возможно, файл перемещён или переименован.
        </p>
        <div class="flex flex-wrap justify-center gap-[var(--space-2)]">
          {#if onRepoint}
            <Button variant="primary" onclick={onRepoint}>Указать файл</Button>
          {/if}
          {#if onRemove}
            <Button variant="ghost" onclick={onRemove}>Убрать вкладку</Button>
          {/if}
        </div>
      </div>
    {:else if unsupported}
      <div class="mx-auto max-w-[560px] p-[var(--space-5)] text-center">
        <p class="mb-[var(--space-4)]">
          Формат этой книги пока не поддерживается встроенным чтением.
        </p>
        <Button variant="secondary" onclick={openInSystem}>Открыть в системе</Button>
      </div>
    {:else if error}
      <div class="mx-auto max-w-[560px] p-[var(--space-5)] text-center">
        <p class="mb-[var(--space-3)] text-[var(--color-danger)]" data-testid="reader-error">
          Не удалось открыть книгу: {error}
        </p>
        {#if onRemove}
          <Button variant="ghost" onclick={onRemove}>Убрать вкладку</Button>
        {/if}
      </div>
    {:else if workplace}
      <WorkplaceContent
        pluginId={workplace.pluginId}
        {path}
        {title}
        {zoom}
        onCapabilities={(value) => (workplaceZoom = value.zoom !== false)}
        onProgress={(value) => {
          progress = value;
          reportState();
        }}
        onError={(value) => (error = value)}
      />
    {:else if content}
      <BookReader
        bind:this={reader}
        {content}
        {zoom}
        {initialPosition}
        {notes}
        {visible}
        onQuote={(anchor) => onQuote?.(anchor)}
        onProgress={(value) => {
          progress = value;
          reportState();
        }}
      />
    {/if}
  </div>

  <footer
    class="flex flex-[0_0_40px] items-center gap-[var(--space-4)] border-t border-[var(--color-border)] bg-[var(--color-surface)] px-[var(--space-4)] text-[12px] text-[var(--color-text-muted)]"
  >
    <div class="flex items-center gap-[var(--space-1)]">
      {#if !workplace || workplaceZoom}
        <Button
          size="icon"
          variant="ghost"
          title="Уменьшить масштаб"
          ariaLabel="Уменьшить масштаб"
          disabled={zoom <= MIN_ZOOM}
          onclick={() => changeZoom(-10)}>−</Button
        >
        <span class="min-w-[48px] text-center" data-testid="reader-zoom">{zoom}%</span>
        <Button
          size="icon"
          variant="ghost"
          title="Увеличить масштаб"
          ariaLabel="Увеличить масштаб"
          disabled={zoom >= MAX_ZOOM}
          onclick={() => changeZoom(10)}>+</Button
        >
      {/if}
    </div>
    <div class="ml-auto flex items-center gap-[var(--space-2)]">
      <span data-testid="reader-progress">{Math.round(progress)}%</span>
      <Progress value={progress} class="w-[180px]" />
    </div>
  </footer>
</div>
