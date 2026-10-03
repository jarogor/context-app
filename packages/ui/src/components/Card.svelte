<script lang="ts">
  import type { Snippet } from 'svelte';
  import { cn } from '../utils';

  interface Props {
    /** Дополнительные классы. */
    class?: string;
    /** Содержимое панели. */
    children: Snippet;
  }

  let { class: className = '', children }: Props = $props();
</script>

<div class={cn('bg-card text-card-foreground rounded-lg border p-4', className)}>
  {@render children()}
</div>
