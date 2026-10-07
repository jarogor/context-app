<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { ErrorToast, UiRenderer, createAsyncState } from '@texture/ui';
  import type { UiIntent } from '@texture/ui-schema';
  import { listenEvent } from '../../shared/app-bridge';
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

  /** Состояние загрузки и ошибок страницы настроек. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError);

  /** Загрузка деклараций интерфейса настроек. */
  async function load() {
    const result = await asyncState.run(loadSettingsUi);
    if (result) {
      declarations = result.declarations;
      asyncState.error = result.error;
    }
  }

  /** Передача действия плагину и обновление деклараций. */
  async function dispatch(intent: UiIntent) {
    const result = await asyncState.run(() => sendSettingsIntent(intent));
    if (result) {
      declarations = result.declarations;
      asyncState.error = result.error;
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

<div class="flex flex-col gap-4 p-4">
  {#if declarations.length === 0}
    <div class="p-6 text-center text-[var(--muted-foreground)]">
      Нет зарегистрированных настроек
    </div>
  {:else}
    {#each declarations as item, index (item.declaration?.id ?? index)}
      {#if item.declaration}
        <div class="flex flex-col gap-3" data-testid="settings-section">
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

<ErrorToast message={asyncState.error} />
