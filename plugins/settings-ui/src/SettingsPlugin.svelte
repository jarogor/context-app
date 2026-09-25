<script lang="ts">
  import { onMount } from 'svelte';
  import type { Section } from './types';
  import { listen, operation } from './bridge';
  import SettingsPage from './SettingsPage.svelte';

  let sections: Section[] = $state([]);
  let errorMessage = $state('');

  /** Загрузка списка секций настроек. */
  async function load() {
    try {
      const data = await operation<{ sections: Section[] }>('list', {});
      sections = data.sections;
      errorMessage = '';
    } catch (error) {
      errorMessage = String(error);
    }
  }

  /** Сохранение значений секции. */
  async function saveSection(id: string, values: unknown) {
    await operation('set', { section: id, values });
    await load();
  }

  onMount(() => {
    let unlisten: (() => void) | undefined;
    void (async () => {
      unlisten = await listen('settings:changed', () => {
        void load();
      });
      await load();
    })();
    return () => {
      unlisten?.();
    };
  });
</script>

<SettingsPage {sections} onSave={saveSection} />

{#if errorMessage}
  <div
    class="fixed right-[8px] bottom-[8px] left-[8px] z-10 rounded-[var(--radius-md)] bg-[var(--color-danger-soft)] p-[var(--space-2)] text-xs text-[var(--color-danger)]"
    role="alert"
  >
    {errorMessage}
  </div>
{/if}
