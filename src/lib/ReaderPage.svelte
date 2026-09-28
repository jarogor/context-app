<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Progress, Spinner } from '@texture/ui';
  import WorkplaceContent from './WorkplaceContent.svelte';
  import {
    UnsupportedFormatError,
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
    /** Возврат к библиотеке. */
    onBack: () => void;
  }

  let { bookId, title, onBack }: Props = $props();

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
  /** Масштаб текста в процентах. */
  let zoom = $state(100);
  /** Прогресс чтения в процентах. */
  let progress = $state(0);
  /** Поддерживает ли плагин рабочего места изменение масштаба. */
  let workplaceZoom = $state(true);
  /** Область отображения книги. */
  let frame: HTMLIFrameElement | undefined = $state();

  /** Канал сообщений между областью отображения и рабочей страницей. */
  const READER_CHANNEL = 'texture-reader';

  /** HTML-документ для области отображения. */
  const documentHtml = $derived(content ? buildDocument(content) : '');

  /** Сборка документа отображения из глав книги.
   *
   * Внутри документа работает собственный скрипт: он сообщает позицию
   * прокрутки родителю и принимает изменения масштаба. При смене масштаба
   * верхняя видимая строка остаётся точкой опоры: положение текста
   * компенсируется, поэтому чтение не «уезжает». Так страница не заглядывает
   * внутрь iframe — это не зависит от движка и политики origin.
   */
  function buildDocument(value: BookContent): string {
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
      `restore(a);report();}});`,
      `report();`,
    ].join('');
    return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><style>${style}</style></head><body>${body}<script>${report}<\/script></body></html>`;
  }

  /** Загрузка содержимого книги. */
  async function load(id: string) {
    loading = true;
    error = null;
    unsupported = false;
    content = null;
    workplace = null;
    progress = 0;
    zoom = 100;
    workplaceZoom = true;
    try {
      const format = await bookFormat(id);
      if (isSupportedFormat(format)) {
        content = await loadBookContent(id);
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
      progress = Math.max(0, Math.min(100, message.value));
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

  $effect(() => {
    const value = zoom;
    frame?.contentWindow?.postMessage(
      { channel: READER_CHANNEL, type: 'zoom', value },
      '*',
    );
  });
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div class="min-h-0 flex-1 overflow-hidden">
    {#if loading}
      <div class="flex h-full items-center justify-center gap-[var(--space-2)] text-[var(--color-text-muted)]">
        <Spinner />
        <span>Открытие книги…</span>
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
        <Button variant="ghost" onclick={onBack}>К списку книг</Button>
      </div>
    {:else if workplace}
      <WorkplaceContent
        pluginId={workplace.pluginId}
        {bookId}
        {title}
        {zoom}
        onCapabilities={(value) => (workplaceZoom = value.zoom !== false)}
        onProgress={(value) => (progress = value)}
        onError={(value) => (error = value)}
      />
    {:else if content}
      <iframe
        bind:this={frame}
        class="h-full w-full border-0 bg-white"
        title="Чтение книги"
        sandbox="allow-scripts"
        srcdoc={documentHtml}
        onload={() =>
          frame?.contentWindow?.postMessage(
            { channel: READER_CHANNEL, type: 'zoom', value: zoom },
            '*',
          )}
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
