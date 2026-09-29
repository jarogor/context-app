<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, Progress, Spinner } from '@texture/ui';
  import WorkplaceContent from './WorkplaceContent.svelte';
  import {
    UnsupportedFormatError,
    bookAvailable,
    bookFormat,
    isSupportedFormat,
    loadBookContent,
    openBookExternally,
    selectWorkplacePlugin,
    type BookContent,
    type WorkplaceSelection,
  } from './reader';

  interface Props {
    /** Идентификатор открытой книги. */
    bookId: string;
    /** Название открытой книги. */
    title: string;
    /** Начальный масштаб чтения в процентах. */
    initialZoom?: number;
    /** Начальная позиция чтения в процентах. */
    initialPosition?: number;
    /** Видима ли поверхность рабочего места. */
    visible?: boolean;
    /** Сообщение об изменении состояния чтения вкладки. */
    onStateChange?: (state: { zoom: number; position: number }) => void;
    /** Книга недоступна: её нет в каталоге или не удалось загрузить. */
    onUnavailable?: () => void;
    /** Просьба переуказать файл недоступной книги. */
    onRepoint?: () => void;
    /** Убрать вкладку. */
    onRemove?: () => void;
  }

  let {
    bookId,
    title,
    initialZoom = 100,
    initialPosition = 0,
    visible = true,
    onStateChange,
    onUnavailable,
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
  /** Книга недоступна. */
  let unavailable = $state(false);
  /** Масштаб текста в процентах (начальное значение берётся один раз). */
  let zoom = $state(untrack(() => initialZoom));
  /** Начальная позиция чтения, взятая при создании вкладки. */
  const startPosition = untrack(() => initialPosition);
  /** Прогресс чтения в процентах. */
  let progress = $state(startPosition);
  /** Восстановлена ли позиция после перемонтирования вкладки. */
  let positionReady = $state(false);
  /** Поддерживает ли плагин рабочего места изменение масштаба. */
  let workplaceZoom = $state(true);
  /** HTML-документ области отображения. */
  let documentHtml = $state('');
  /** Область отображения книги. */
  let frame: HTMLIFrameElement | undefined = $state();

  /** Канал сообщений между областью отображения и рабочей страницей. */
  const READER_CHANNEL = 'texture-reader';

  /** Сообщение об изменении состояния чтения вкладки. */
  function reportState() {
    onStateChange?.({ zoom, position: progress });
  }

  /** Сборка документа отображения из глав книги.
   *
   * Начальные масштаб и позиция встраиваются в документ, потому что он
   * собирается один раз при загрузке; дальнейшая смена масштаба приходит
   * сообщением. Скрипт документа сообщает позицию прокрутки родителю.
   */
  function buildDocument(value: BookContent, startZoom: number, startPosition: number): string {
    const body = value.chapters.map((chapter) => chapter.html).join('\n');
    const style = [
      'html{font-size:100%;}',
      "body{margin:0 auto;max-width:760px;padding:24px 32px;background:#fff;",
      "color:#1f2937;font-family:Georgia,'Times New Roman',serif;line-height:1.6;}",
      'img{max-width:100%;height:auto;}',
      'h1,h2,h3{line-height:1.25;}',
      'a{color:#4338ca;}',
    ].join('');
    const report = [
      `const initial={zoom:${startZoom},position:${startPosition}};`,
      `const root=()=>document.scrollingElement||document.documentElement;`,
      `const report=()=>{const e=root();const max=e.scrollHeight-e.clientHeight;`,
      `parent.postMessage({channel:'${READER_CHANNEL}',type:'progress',`,
      `value:max>0?(e.scrollTop/max)*100:0},'*');};`,
      `const anchor=()=>{const x=Math.round(innerWidth/2),y=30;try{`,
      `if(document.caretPositionFromPoint){const p=document.caretPositionFromPoint(x,y);`,
      `if(p&&p.offsetNode){const r=document.createRange();r.setStart(p.offsetNode,p.offset);`,
      `r.collapse(true);return{node:p.offsetNode,offset:p.offset,top:r.getBoundingClientRect().top};}}`,
      `if(document.caretRangeFromPoint){const cr=document.caretRangeFromPoint(x,y);`,
      `if(cr){const r=document.createRange();r.setStart(cr.startContainer,cr.startOffset);`,
      `r.collapse(true);return{node:cr.startContainer,offset:cr.startOffset,top:r.getBoundingClientRect().top};}}`,
      `}catch(e){}return null;};`,
      `const restore=(a)=>{if(!a)return;try{const r=document.createRange();`,
      `r.setStart(a.node,a.offset);r.collapse(true);`,
      `const delta=r.getBoundingClientRect().top-a.top;`,
      `if(delta){root().scrollTop+=delta;}}catch(e){}};`,
      `addEventListener('scroll',report,{passive:true});`,
      `addEventListener('resize',report);`,
      `addEventListener('message',event=>{const m=event.data;`,
      `if(m&&m.channel==='${READER_CHANNEL}'&&m.type==='zoom'){`,
      `const a=anchor();document.documentElement.style.fontSize=m.value+'%';`,
      `restore(a);report();}`,
      `else if(m&&m.channel==='${READER_CHANNEL}'&&m.type==='position'){`,
      `const e=root();const mx=e.scrollHeight-e.clientHeight;`,
      `if(mx>0){e.scrollTop=mx*(m.value/100);}report();}});`,
      `document.documentElement.style.fontSize=initial.zoom+'%';`,
      `const start=root();const max=start.scrollHeight-start.clientHeight;`,
      `if(max>0&&initial.position>0){start.scrollTop=max*initial.position/100;}`,
      `report();`,
    ].join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}<script>${report}<\/script></body></html>`;
  }

  /** Загрузка содержимого книги. */
  async function load(id: string) {
    loading = true;
    error = null;
    unsupported = false;
    unavailable = false;
    content = null;
    workplace = null;
    try {
      const available = await bookAvailable(id).catch(() => true);
      if (!available) {
        unavailable = true;
        onUnavailable?.();
        return;
      }
      const format = await bookFormat(id);
      if (isSupportedFormat(format)) {
        const value = await loadBookContent(id);
        content = value;
        documentHtml = buildDocument(value, zoom, progress);
      } else {
        const selection = await selectWorkplacePlugin(id);
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

  /** Обработка сообщений области отображения: прогресс чтения. */
  function handleReaderMessage(event: MessageEvent) {
    if (event.source !== frame?.contentWindow) {
      return;
    }
    const message = event.data as
      | { channel?: string; type?: string; value?: unknown }
      | null
      | undefined;
    if (!message || message.channel !== READER_CHANNEL) {
      return;
    }
    if (message.type === 'progress' && typeof message.value === 'number') {
      if (!visible || (content && !positionReady)) {
        return;
      }
      progress = Math.max(0, Math.min(100, message.value));
      reportState();
    }
  }

  /** Открытие файла книги в системном приложении. */
  async function openInSystem() {
    error = null;
    try {
      await openBookExternally(bookId);
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    void load(bookId);
    window.addEventListener('message', handleReaderMessage);
    return () => {
      window.removeEventListener('message', handleReaderMessage);
    };
  });

  /** Передача текущего масштаба области отображения. */
  $effect(() => {
    const value = zoom;
    if (!content || !frame) {
      return;
    }
    frame.contentWindow?.postMessage({ channel: READER_CHANNEL, type: 'zoom', value }, '*');
  });
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
          Книга недоступна: возможно, файл перемещён или библиотека не открыта.
        </p>
        <div class="flex flex-wrap justify-center gap-[var(--space-2)]">
          {#if onRepoint}
            <Button variant="primary" onclick={onRepoint}>Переуказать файл</Button>
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
        {bookId}
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
      <iframe
        bind:this={frame}
        class="h-full w-full border-0 bg-white"
        title="Чтение книги"
        sandbox="allow-scripts"
        srcdoc={documentHtml}
        onload={() => {
          frame?.contentWindow?.postMessage(
            { channel: READER_CHANNEL, type: 'zoom', value: zoom },
            '*',
          );
          frame?.contentWindow?.postMessage(
            { channel: READER_CHANNEL, type: 'position', value: startPosition },
            '*',
          );
          positionReady = true;
        }}
      ></iframe>
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
