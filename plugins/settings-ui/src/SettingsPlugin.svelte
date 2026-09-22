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
  <div class="plugin-error" role="alert">{errorMessage}</div>
{/if}

<style>
  .plugin-error {
    position: fixed;
    left: 8px;
    right: 8px;
    bottom: 8px;
    padding: 8px;
    border-radius: 4px;
    background: #fdecea;
    color: #b3261e;
    font-size: 12px;
    z-index: 10;
  }
</style>
