<script lang="ts">
  import { onMount } from 'svelte';
  import { Card } from '@texture/ui';
  import { invokeCommand } from './app-bridge';

  /** Служебное расположение в сведениях о приложении. */
  interface AppPath {
    /** Машинный ключ расположения. */
    key: string;
    /** Человекочитаемое название. */
    title: string;
    /** Абсолютный путь. */
    path: string;
    /** Пояснение назначения. */
    note: string;
  }

  /** Сведения о приложении. */
  interface AppInfo {
    /** Отображаемое название. */
    name: string;
    /** Версия приложения. */
    version: string;
    /** Служебные каталоги и файлы. */
    paths: AppPath[];
  }

  let info: AppInfo | null = $state(null);
  let error = $state('');

  /** Загрузка сведений о приложении из ядра. */
  async function load() {
    try {
      info = (await invokeCommand('app_info', {})) as AppInfo;
      error = '';
    } catch (e) {
      error = String(e);
    }
  }

  onMount(() => {
    void load();
  });
</script>

<div class="flex flex-col gap-[var(--space-4)] p-[var(--space-4)]">
  {#if error}
    <div class="text-[13px] text-[var(--color-danger)]">{error}</div>
  {:else if !info}
    <div class="p-[var(--space-5)] text-center text-[var(--color-text-muted)]">Загрузка…</div>
  {:else}
    <Card>
      <div class="flex flex-wrap items-baseline gap-[var(--space-2)]">
        <span class="text-base font-semibold">{info.name}</span>
        <span class="font-mono text-sm text-[var(--color-text-muted)]">версия {info.version}</span>
      </div>
    </Card>

    <Card>
      <h2 class="mb-[var(--space-3)] text-base font-semibold">Расположение конфигов и кешей</h2>
      <ul class="flex list-none flex-col gap-[var(--space-2)] p-0">
        {#each info.paths as path (path.key)}
          <li class="flex flex-col gap-[2px] rounded-[var(--radius-md)] border border-[var(--color-border)] p-[var(--space-2)]">
            <span class="text-sm font-bold">{path.title}</span>
            <code class="break-all font-mono text-xs text-[var(--color-text)]">{path.path}</code>
            <span class="text-xs text-[var(--color-text-muted)]">{path.note}</span>
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
</div>
