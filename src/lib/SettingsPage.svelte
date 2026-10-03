<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { UiRenderer } from '@texture/ui';
  import type { UiIntent } from '@texture/ui-schema';
  import { listenEvent } from './app-bridge';
  import { loadSettingsUi, sendSettingsIntent, type NormalizedDeclaration } from './settings';

  interface Props {
    /** Декларации, загруженные на бутстрапе; `undefined` — загрузить при монтировании. */
    initialDeclarations?: NormalizedDeclaration[];
    /** Ошибка загрузки деклараций на бутстрапе. */
    initialError?: string;
  }

  let { initialDeclarations, initialError = '' }: Props = $props();

  /** Декларации пространства «секция настроек», отданные плагином. */
  let declarations = $state<NormalizedDeclaration[]>(untrack(() => initialDeclarations ?? []));

  /** Ошибка загрузки или выполнения действия. */
  let errorMessage = $state(untrack(() => initialError));

  /** Загрузка деклараций интерфейса настроек. */
  async function load() {
    try {
      const result = await loadSettingsUi();
      declarations = result.declarations;
      errorMessage = result.error;
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Передача действия плагину и обновление деклараций. */
  async function dispatch(intent: UiIntent) {
    try {
      const result = await sendSettingsIntent(intent);
      declarations = result.declarations;
      errorMessage = result.error;
    } catch (error) {
      errorMessage = String(error);
    }
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listenEvent('settings:changed', () => {
        void load();
      });
      // Декларации уже загружены на бутстрапе; без них (в изоляции) грузим сами.
      if (initialDeclarations === undefined) {
        await load();
      }
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<div class="flex flex-col gap-[var(--space-4)] p-[var(--space-4)]">
  {#if declarations.length === 0}
    <div class="p-[var(--space-5)] text-center text-[var(--color-text-muted)]">
      Нет зарегистрированных настроек
    </div>
  {:else}
    {#each declarations as item, index (item.declaration?.id ?? index)}
      {#if item.declaration}
        <div class="flex flex-col gap-[var(--space-3)]" data-testid="settings-section">
          <UiRenderer
            declaration={item.declaration}
            diagnostics={item.diagnostics}
            onintent={dispatch}
          />
        </div>
      {/if}
    {/each}
  {/if}
</div>

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-[var(--space-2)] text-xs text-[var(--color-danger)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
