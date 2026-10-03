<script lang="ts">
  import type { UiIntent, UiSpaceDeclaration } from '@texture/ui-schema';
  import UiNodeView from './UiNodeView.svelte';
  import { collectValues } from './values';

  interface Props {
    /** Декларация пространства интерфейса от плагина. */
    declaration: UiSpaceDeclaration;
    /** Отклонённые каталогом узлы (диагностика). */
    diagnostics?: string[];
    /** Передача интента плагину. */
    onintent: (intent: UiIntent) => void;
  }

  let { declaration, diagnostics = [], onintent }: Props = $props();

  /** Текущие значения контролов пространства. */
  let values = $state<Record<string, unknown>>({});

  // Пересборка значений при смене декларации: источник истины — плагин.
  $effect(() => {
    values = collectValues(declaration.nodes);
  });

  /** Обновление значения контрола. */
  function setValue(name: string, value: unknown) {
    if (!name) {
      return;
    }
    values = { ...values, [name]: value };
  }

  /** Передача действия плагину со снимком текущих значений. */
  function dispatch(action: string) {
    onintent({ space: declaration.space, id: declaration.id, action, values: { ...values } });
  }
</script>

{#if diagnostics.length > 0}
  <p class="mb-[var(--space-2)] text-xs text-[var(--color-danger)]" role="status">
    {diagnostics.join('; ')}
  </p>
{/if}
<div class="flex flex-col gap-[var(--space-3)]">
  {#each declaration.nodes as node}
    {#if node.type !== '#text'}
      <UiNodeView {node} {values} onvalue={setValue} onaction={dispatch} />
    {/if}
  {/each}
</div>
