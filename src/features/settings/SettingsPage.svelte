<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Button, ErrorToast, Icon, ScrollArea, UiRenderer, collectValues, createAsyncState } from '@texture/ui';
  import type { UiIntent, UiNode, UiSpaceDeclaration } from '@texture/ui-schema';
  import { listenEvent } from '../../shared/app-bridge';
  import {
    loadSettingsUi,
    saveSettingsSections,
    sendSettingsIntent,
    type NormalizedDeclaration,
    type SettingsSectionValues,
  } from './settings';

  interface Props {
    /** Декларации, загруженные на бутстрапе; `undefined` — загрузить при монтировании. */
    initialDeclarations?: NormalizedDeclaration[];
    /** Ошибка загрузки деклараций на бутстрапе. */
    initialError?: string;
    /** Закрытие полноэкранного раздела настроек. */
    onclose?: () => void;
  }

  let { initialDeclarations, initialError = '', onclose }: Props = $props();

  /** Декларации пространства «секция настроек», отданные плагином. */
  let declarations = $state<NormalizedDeclaration[]>(untrack(() => initialDeclarations ?? []));
  /** Черновик значений по идентификатору секции (правки до сохранения). */
  let draft = $state<Record<string, Record<string, unknown>>>({});
  /** Сохранённые значения по идентификатору секции: источник для сравнения. */
  let saved = $state<Record<string, Record<string, unknown>>>({});

  /** Состояние загрузки и ошибок страницы настроек. */
  const asyncState = createAsyncState();

  // Ошибка, переданная с бутстрапа, показывается сразу при монтировании.
  asyncState.error = untrack(() => initialError);

  /** Значения контролов секции из её декларации. */
  function valuesFromNodes(nodes: UiNode[]): Record<string, unknown> {
    return collectValues(nodes);
  }

  /** Пересборка исходных значений из текущих деклараций. */
  function syncSaved(list: NormalizedDeclaration[]) {
    const next: Record<string, Record<string, unknown>> = {};
    for (const item of list) {
      if (item.declaration) {
        next[item.declaration.id] = valuesFromNodes(item.declaration.nodes);
      }
    }
    saved = next;
  }

  // Исходные значения при первой отрисовке — из деклараций бутстрапа.
  syncSaved(untrack(() => declarations));

  /** Сравнение черновика с сохранённым состоянием по всем секциям. */
  const dirty = $derived.by(() => {
    for (const [id, values] of Object.entries(draft)) {
      const base = saved[id] ?? {};
      const keys = new Set([...Object.keys(base), ...Object.keys(values)]);
      for (const key of keys) {
        if (JSON.stringify(values[key] ?? null) !== JSON.stringify(base[key] ?? null)) {
          return true;
        }
      }
    }
    return false;
  });

  /** Загрузка деклараций интерфейса настроек. */
  async function load() {
    const result = await asyncState.run(loadSettingsUi);
    if (result) {
      declarations = result.declarations;
      syncSaved(result.declarations);
      asyncState.error = result.error;
    }
  }

  /** Передача действия плагину и обновление деклараций. */
  async function dispatch(intent: UiIntent) {
    const result = await asyncState.run(() => sendSettingsIntent(intent));
    if (result) {
      declarations = result.declarations;
      syncSaved(result.declarations);
      asyncState.error = result.error;
    }
  }

  /** Сохранение черновика всех секций одним неделимым действием. */
  async function save() {
    const sections: SettingsSectionValues[] = Object.entries(draft).map(([section, values]) => ({
      section,
      values,
    }));
    if (sections.length === 0) {
      return;
    }
    const result = await asyncState.run(() => saveSettingsSections(sections));
    if (result) {
      declarations = result.declarations;
      syncSaved(result.declarations);
      // Черновик синхронизируется с сохранённым состоянием: кнопка снова гаснет.
      draft = {};
      asyncState.error = result.error;
    }
  }

  /** Обновление черновика секции из контролов. */
  function updateDraft(id: string, values: Record<string, unknown>) {
    draft = { ...draft, [id]: values };
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

<div class="flex min-h-0 flex-1 flex-col" data-testid="settings-page">
  <div
    class="flex shrink-0 items-center justify-end border-b border-[var(--border)] px-4 py-2"
  >
    <Button
      variant="secondary"
      size="icon"
      title="Закрыть настройки"
      ariaLabel="Закрыть настройки"
      onclick={() => onclose?.()}
    >
      <Icon name="close" />
    </Button>
  </div>
  <ScrollArea testId="settings-sections" class="gap-6 p-4">
    {#if declarations.length === 0}
      <div class="p-6 text-center text-[var(--muted-foreground)]">
        Нет зарегистрированных настроек
      </div>
    {:else}
      {#each declarations as item, index (item.declaration?.id ?? index)}
        {#if item.declaration}
          <div class="flex flex-col" data-testid="settings-section">
            <UiRenderer
              declaration={item.declaration}
              diagnostics={item.diagnostics}
              showGroup
              baseline={saved[(item.declaration as UiSpaceDeclaration).id] ?? {}}
              onintent={dispatch}
              onvalues={(values: Record<string, unknown>) =>
                updateDraft((item.declaration as UiSpaceDeclaration).id, values)}
            />
          </div>
        {/if}
      {/each}
    {/if}
  </ScrollArea>
  <div
    class="flex shrink-0 items-center justify-end border-t border-[var(--border)] px-4 py-2"
    data-testid="settings-footer"
  >
    <Button variant="primary" disabled={!dirty} onclick={save}>Сохранить</Button>
  </div>
</div>

<ErrorToast message={asyncState.error} />
