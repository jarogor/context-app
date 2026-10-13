<script lang="ts">
  import { Dialog as DialogPrimitive } from 'bits-ui';
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Открытость диалога. */
    open?: boolean;
    /** Заголовок диалога (нужен для доступности модального окна). */
    title: string;
    /** Дополнительные классы окна. */
    class?: string;
    /** Показывать ли встроенную кнопку закрытия (крестик). */
    showClose?: boolean;
    /** Содержимое окна под заголовком. */
    children: Snippet;
    /** Обработчик изменения открытости (закрытие по Esc или клику вне). */
    onOpenChange?: (open: boolean) => void;
  }

  let {
    open = $bindable(false),
    title,
    class: className = '',
    showClose = true,
    children,
    onOpenChange,
  }: Props = $props();
</script>

<DialogPrimitive.Root bind:open onOpenChange={(value) => onOpenChange?.(value)}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay class="fixed inset-0 z-50 bg-black/40" />
    <DialogPrimitive.Content
      class={cn(
        'fixed top-1/2 left-1/2 z-50 flex max-h-[85vh] w-[min(520px,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--popover)] p-5 text-[var(--popover-foreground)] shadow-md outline-none',
        className,
      )}
    >
      <DialogPrimitive.Title class="text-base font-semibold">{title}</DialogPrimitive.Title>
      {@render children()}
      {#if showClose}
        <DialogPrimitive.Close
          aria-label="Закрыть"
          class="absolute top-4 right-4 inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        </DialogPrimitive.Close>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
