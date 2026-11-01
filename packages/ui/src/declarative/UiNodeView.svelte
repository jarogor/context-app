<script lang="ts">
  import type { UiElement } from '@context/ui-schema';
  import { localize, t } from '@context/i18n';
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
    /** Сохранённые значения контролов: база для подсветки изменённых полей. */
    baseline?: Record<string, unknown>;
    /** Событие контрола: имя поля и новое значение. */
    onvalue: (name: string, value: unknown) => void;
    /** Действие узла: идентификатор действия. */
    onaction: (action: string) => void;
  }

  let { node, values, baseline, onvalue, onaction }: Props = $props();

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
  /** Варианты выбора в форме выпадающего списка. */
  const selectOptions = $derived(
    options.map((option) => ({ value: String(option.value), label: localize(String(option.title)) })),
  );
  /** Уровень заголовка. */
  const level = $derived(typeof node.props?.level === 'number' ? (node.props.level as number) : 2);
  /** Идентификатор контрола для связи с подписью. */
  const controlId = $derived(name ? `ui-${name}` : undefined);
  /** Название поля. */
  const label = $derived(
    typeof node.props?.label === 'string' ? localize(node.props.label) : '',
  );
  /** Пояснение поля, если оно задано контролом. */
  const description = $derived(
    typeof node.props?.description === 'string' ? localize(node.props.description) : '',
  );
  /** Признак того, что значение поля отличается от сохранённого состояния. */
  const changed = $derived(name !== '' && !sameValue(values[name], baseline?.[name]));
  /** Классы названия поля: изменённое поле выделяется акцентным цветом. */
  const labelClass = $derived(
    cn('text-sm font-medium', changed ? 'text-[var(--primary)]' : 'text-[var(--foreground)]'),
  );

  /** Сравнение значений по сериализации с приведением отсутствия к `null`. */
  function sameValue(a: unknown, b: unknown): boolean {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  }

  /**
   * Классы раскладки поля: две колонки (название слева, контрол и пояснение
   * справа) на широком контейнере; на узком — столбиком. Переключение по ширине
   * контейнера, а не окна: поле живёт внутри области настроек. Колонка названия
   * ограничена сверху, а не задана жёстко: на узком контейнере она сжимается и
   * не выдавливает контрол за край.
   */
  const fieldGridClass =
    'grid grid-cols-1 gap-2 @min-[34rem]:grid-cols-[minmax(0,16rem)_minmax(0,1fr)] @min-[34rem]:items-start @min-[34rem]:gap-x-6';
</script>

{#snippet fieldLabel()}
  <label
    class={labelClass}
    for={controlId}
    data-changed={changed ? 'true' : 'false'}
    title={changed ? t('app.settings.changed') : undefined}
  >
    {label}{#if changed}<span
        class="bg-[var(--primary)] ml-1.5 inline-block size-1.5 rounded-full align-middle"
        aria-hidden="true"
      ></span>{/if}
  </label>
{/snippet}

{#if node.type === 'Card'}
  <Card>
    {#each node.children ?? [] as child}
      <Self node={child as UiElement} {values} {baseline} {onvalue} {onaction} />
    {/each}
  </Card>
{:else if node.type === 'Heading'}
  <svelte:element
    this={`h${Math.min(6, Math.max(1, level))}`}
    class="mb-1 text-base font-semibold"
  >
    {localize(String(node.props?.text ?? ''))}
  </svelte:element>
{:else if node.type === 'Text'}
  <p class="text-muted-foreground mb-2 role-body">
    {localize(String(node.props?.text ?? ''))}
  </p>
{:else if node.type === 'Checkbox'}
  <div class={fieldGridClass}>
    {@render fieldLabel()}
    <div class="flex items-center gap-2">
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
      {#if description}
        <p class="text-muted-foreground text-xs">{description}</p>
      {/if}
    </div>
  </div>
{:else if node.type === 'Input'}
  <div class={fieldGridClass}>
    {#if label}
      {@render fieldLabel()}
    {/if}
    <div class="flex flex-col gap-1.5">
      <Input
        id={controlId}
        type={node.props?.type === 'number' ? 'number' : 'text'}
        class={node.props?.type === 'number' ? 'max-w-[8rem]' : ''}
        value={text()}
        oninput={(event) => {
          onvalue(name, event.currentTarget.value);
          const next = action('input');
          if (next) {
            onaction(next);
          }
        }}
      />
      {#if description}
        <p class="text-muted-foreground text-xs">{description}</p>
      {/if}
    </div>
  </div>
{:else if node.type === 'Textarea'}
  <div class={fieldGridClass}>
    {#if label}
      {@render fieldLabel()}
    {/if}
    <div class="flex flex-col gap-1.5">
      <Textarea
        id={controlId}
        class="min-h-[6.25rem] role-mono"
        value={text()}
        oninput={(event) => {
          onvalue(name, event.currentTarget.value);
          const next = action('input');
          if (next) {
            onaction(next);
          }
        }}
      />
      {#if description}
        <p class="text-muted-foreground text-xs">{description}</p>
      {/if}
    </div>
  </div>
{:else if node.type === 'Select'}
  <div class={fieldGridClass}>
    {#if label}
      {@render fieldLabel()}
    {/if}
    <div class="flex flex-col gap-1.5">
      <Select
        id={controlId}
        class="max-w-[26.25rem]"
        value={text()}
        items={selectOptions}
        ariaLabel={label || undefined}
        onchange={(next) => {
          onvalue(name, next);
          const nextAction = action('change');
          if (nextAction) {
            onaction(nextAction);
          }
        }}
      />
      {#if description}
        <p class="text-muted-foreground text-xs">{description}</p>
      {/if}
    </div>
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
    {localize(String(node.props?.label ?? ''))}
  </Button>
{:else}
  <span class={cn('text-muted-foreground role-body')}>
    {t('app.settings.unknownComponent', { type: node.type })}
  </span>
{/if}
