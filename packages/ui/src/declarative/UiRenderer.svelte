<script lang="ts">
  import type { UiIntent, UiSpaceDeclaration } from '@texture/ui-schema';
  import { untrack } from 'svelte';
  import UiNodeView from './UiNodeView.svelte';
  import { collectValues } from './values';

  interface Props {
    /** Декларация пространства интерфейса от плагина. */
    declaration: UiSpaceDeclaration;
    /** Отклонённые каталогом узлы (диагностика). */
    diagnostics?: string[];
    /** Передача интента плагину. */
    onintent: (intent: UiIntent) => void;
    /** Текущая карта значений контролов после правок пользователя. */
    onvalues?: (values: Record<string, unknown>) => void;
    /** Сохранённые значения контролов: база для подсветки изменённых полей. */
    baseline?: Record<string, unknown>;
    /** Показывать заголовок и описание декларации как заголовок группы. */
    showGroup?: boolean;
  }

  let {
    declaration,
    diagnostics = [],
    onintent,
    onvalues,
    baseline,
    showGroup = false,
  }: Props = $props();

  /** Текущие значения контролов пространства. */
  let values = $state<Record<string, unknown>>({});

  // Пересборка значений при смене декларации: источник истины — плагин.
  // Если декларация пришла с сервера заново, черновик страницы синхронизируется с ней.
  $effect(() => {
    values = collectValues(declaration.nodes);
  });

  // Уведомление наружу о текущих значениях. Колбэк вызывается вне реактивных
  // зависимостей: иначе пересоздаваемый родителем `onvalues` зациклил бы эффект.
  $effect(() => {
    const snapshot = { ...values };
    untrack(() => onvalues?.(snapshot));
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

  /** Описание экземпляра пространства, если оно задано. */
  const groupDescription = $derived(
    typeof declaration.description === 'string' ? declaration.description : '',
  );
</script>

{#if diagnostics.length > 0}
  <p class="text-destructive mb-2 text-xs" role="status">
    {diagnostics.join('; ')}
  </p>
{/if}
{#if showGroup && (declaration.title || groupDescription)}
  <div class="mb-2 flex items-center gap-3" data-testid="settings-group-heading">
    {#if declaration.title}
      <span class="shrink-0 text-base font-semibold text-[var(--foreground)]">
        {declaration.title}
      </span>
    {/if}
    <span class="h-px min-w-4 flex-1 bg-[var(--border)]" aria-hidden="true"></span>
  </div>
  {#if groupDescription}
    <p class="mb-3 text-muted-foreground text-[0.8125rem]" data-testid="settings-group-description">
      {groupDescription}
    </p>
  {/if}
{/if}
<div class="@container flex flex-col gap-5 pl-4" data-testid="settings-group-body">
  {#each declaration.nodes as node}
    {#if node.type !== '#text'}
      <UiNodeView {node} {values} {baseline} onvalue={setValue} onaction={dispatch} />
    {/if}
  {/each}
</div>
