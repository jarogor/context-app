<script lang="ts">
  import type { UiElement } from '@texture/ui-schema';
  import { cn } from '../utils';
  import Button from '../components/Button.svelte';
  import Card from '../components/Card.svelte';
  import Checkbox from '../components/Checkbox.svelte';
  import Input from '../components/Input.svelte';
  import Select from '../components/Select.svelte';
  import Textarea from '../components/Textarea.svelte';
  import Self from './UiNodeView.svelte';

  interface Props {
    /** Узел дерева интерфейса. */
    node: UiElement;
    /** Текущие значения контролов пространства. */
    values: Record<string, unknown>;
    /** Событие контрола: имя поля и новое значение. */
    onvalue: (name: string, value: unknown) => void;
    /** Действие узла: идентификатор действия. */
    onaction: (action: string) => void;
  }

  let { node, values, onvalue, onaction }: Props = $props();

  /** Имя контрола в карте значений. */
  const name = $derived(typeof node.props?.name === 'string' ? (node.props.name as string) : '');
  /** Действие, связанное с событием, или `undefined`. */
  function action(event: string): string | undefined {
    return node.on?.[event];
  }
  /** Строковое значение контрола. */
  function text(): string {
    const value = values[name];
    return value === undefined || value === null ? '' : String(value);
  }
  /** Варианты выбора поля `select`. */
  const options = $derived(
    Array.isArray(node.props?.options)
      ? (node.props.options as Array<{ value: unknown; title: unknown }>)
      : [],
  );
  /** Уровень заголовка. */
  const level = $derived(typeof node.props?.level === 'number' ? (node.props.level as number) : 2);
  /** Идентификатор контрола для связи с подписью. */
  const controlId = $derived(name ? `ui-${name}` : undefined);
</script>

{#if node.type === 'Card'}
  <Card>
    {#each node.children ?? [] as child}
      <Self node={child as UiElement} {values} {onvalue} {onaction} />
    {/each}
  </Card>
{:else if node.type === 'Heading'}
  <svelte:element
    this={`h${Math.min(6, Math.max(1, level))}`}
    class="mb-[var(--space-1)] text-base font-semibold"
  >
    {node.props?.text ?? ''}
  </svelte:element>
{:else if node.type === 'Text'}
  <p class="mb-[var(--space-2)] text-[13px] text-[var(--color-text-muted)]">
    {node.props?.text ?? ''}
  </p>
{:else if node.type === 'Checkbox'}
  <label class="flex items-center gap-[var(--space-2)] text-[13px]">
    <Checkbox
      id={controlId}
      checked={values[name] === true}
      onchange={(event) => {
        onvalue(name, event.currentTarget.checked);
        const next = action('change');
        if (next) {
          onaction(next);
        }
      }}
    />
    <span>{node.props?.label ?? ''}</span>
  </label>
{:else if node.type === 'Input'}
  <div class="flex flex-col gap-[var(--space-1)]">
    {#if node.props?.label}
      <label class="text-[13px] text-[var(--color-text-muted)]" for={controlId}>
        {node.props.label}
      </label>
    {/if}
    <Input
      id={controlId}
      type={node.props?.type === 'number' ? 'number' : 'text'}
      value={text()}
      oninput={(event) => {
        onvalue(name, event.currentTarget.value);
        const next = action('input');
        if (next) {
          onaction(next);
        }
      }}
    />
  </div>
{:else if node.type === 'Textarea'}
  <div class="flex flex-col gap-[var(--space-1)]">
    {#if node.props?.label}
      <label class="text-[13px] text-[var(--color-text-muted)]" for={controlId}>
        {node.props.label}
      </label>
    {/if}
    <Textarea
      id={controlId}
      class="min-h-[100px] font-mono text-[13px]"
      value={text()}
      oninput={(event) => {
        onvalue(name, event.currentTarget.value);
        const next = action('input');
        if (next) {
          onaction(next);
        }
      }}
    />
  </div>
{:else if node.type === 'Select'}
  <div class="flex flex-col gap-[var(--space-1)]">
    {#if node.props?.label}
      <label class="text-[13px] text-[var(--color-text-muted)]" for={controlId}>
        {node.props.label}
      </label>
    {/if}
    <Select
      id={controlId}
      class="max-w-[420px]"
      value={text()}
      onchange={(event) => {
        onvalue(name, event.currentTarget.value);
        const next = action('change');
        if (next) {
          onaction(next);
        }
      }}
    >
      {#each options as option}
        <option value={String(option.value)}>{String(option.title)}</option>
      {/each}
    </Select>
  </div>
{:else if node.type === 'Button'}
  <Button
    variant={node.props?.variant === 'primary' || node.props?.variant === 'danger' || node.props?.variant === 'ghost'
      ? node.props.variant
      : 'secondary'}
    disabled={node.props?.disabled === true}
    onclick={() => {
      const next = action('click');
      if (next) {
        onaction(next);
      }
    }}
  >
    {node.props?.label ?? ''}
  </Button>
{:else}
  <span class={cn('text-[13px] text-[var(--color-text-muted)]')}>
    Неизвестный компонент: {node.type}
  </span>
{/if}
