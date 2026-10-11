<script lang="ts">
  import { onMount } from 'svelte';
  import { Card, SurfaceScroll } from '@texture/ui';
  import { invokeCommand } from '../../shared/app-bridge';

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

<SurfaceScroll testId="app-info-page" class="gap-4 p-4">
  {#if error}
    <div class="text-[13px] text-[var(--destructive)]">{error}</div>
  {:else if !info}
    <div class="p-6 text-center text-[var(--muted-foreground)]">Загрузка…</div>
  {:else}
    <Card>
      <div class="flex flex-wrap items-baseline gap-2">
        <span class="text-base font-semibold">{info.name}</span>
        <span class="font-mono text-sm text-[var(--muted-foreground)]">версия {info.version}</span>
      </div>
    </Card>

    <Card>
      <h2 class="mb-3 text-base font-semibold">Расположение конфигов и кешей</h2>
      <ul class="flex list-none flex-col gap-2 p-0">
        {#each info.paths as path (path.key)}
          <li class="flex flex-col gap-[2px] rounded-md border border-[var(--border)] p-2">
            <span class="text-sm font-bold">{path.title}</span>
            <code class="break-all font-mono text-xs text-[var(--foreground)]">{path.path}</code>
            <span class="text-xs text-[var(--muted-foreground)]">{path.note}</span>
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
</SurfaceScroll>
