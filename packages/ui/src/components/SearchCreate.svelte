<script lang="ts">
  import IconButton from './IconButton.svelte';
  import Input from './Input.svelte';
  import { cn } from '../utils';

  interface Props {
    /** Запрос поиска (двусторонняя привязка). */
    query?: string;
    /** Плейсхолдер поиска; пустая строка скрывает поиск. */
    searchPlaceholder?: string;
    /** Плейсхолдер поля создания; пустая строка скрывает создание. */
    createPlaceholder?: string;
    /** Подпись кнопки создания. */
    createTitle?: string;
    /** Метка доступности кнопки создания. */
    createAriaLabel?: string;
    /** Обработчик создания элемента с введённым именем. */
    onCreate?: (name: string) => void;
    /** Обработчик изменения поискового запроса (например, серверный поиск). */
    onSearch?: (value: string) => void;
    /** Дополнительные классы. */
    class?: string;
  }

  let {
    query = $bindable(''),
    searchPlaceholder = '',
    createPlaceholder = '',
    createTitle = 'Добавить',
    createAriaLabel,
    onCreate,
    onSearch,
    class: className = '',
  }: Props = $props();

  /** Ввод имени нового элемента. */
  let newName = $state('');

  /** Создание элемента из поля ввода. */
  function create() {
    const name = newName.trim();
    if (!name) {
      return;
    }
    onCreate?.(name);
    newName = '';
  }
</script>

<div class={cn('flex flex-col gap-3', className)}>
  {#if createPlaceholder}
    <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Input
        bind:value={newName}
        placeholder={createPlaceholder}
        class="min-w-0 sm:flex-1"
        onkeydown={(event) => {
          if (event.key === 'Enter') {
            create();
          }
        }}
      />
      <IconButton
        action="add"
        title={createTitle}
        ariaLabel={createAriaLabel ?? createTitle}
        disabled={!newName.trim()}
        onclick={create}
        class="sm:flex-none"
      />
    </div>
  {/if}

  {#if searchPlaceholder}
    <Input
      bind:value={query}
      placeholder={searchPlaceholder}
      ariaLabel={searchPlaceholder}
      icon="search"
      oninput={onSearch ? (event) => onSearch(event.currentTarget.value) : undefined}
    />
  {/if}
</div>
