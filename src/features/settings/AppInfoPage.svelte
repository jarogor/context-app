<script lang="ts">
  import { onMount } from 'svelte';
  import { Card, ScrollArea } from '@texture/ui';
  import { invokeCommand } from '../../shared/app-bridge';

  /** Служебное расположение в сведениях о приложении. */
  interface AppPath {
    /** Машинный ключ расположения. */
    key: string;
    /** Уровень расположения: каркас или приложение. */
    level: 'framework' | 'application';
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

  /** Расположения заданного уровня из снимка (пустой список до загрузки). */
  function pathsAtLevel(level: 'framework' | 'application'): AppPath[] {
    if (!info) {
      return [];
    }
    return info.paths.filter((path) => path.level === level);
  }

  /** Расположения уровня каркаса. */
  const frameworkPaths = $derived(pathsAtLevel('framework'));

  /** Расположения уровня приложения. */
  const applicationPaths = $derived(pathsAtLevel('application'));

  onMount(() => {
    void load();
  });
</script>

<ScrollArea testId="app-info-page" class="gap-4 p-4">
  {#if error}
    <div class="text-[0.8125rem] text-[var(--destructive)]">{error}</div>
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
      <h2 class="mb-3 text-base font-semibold">Каркас</h2>
      <ul class="flex list-none flex-col gap-2 p-0">
        {#each frameworkPaths as path (path.key)}
          <li class="flex flex-col gap-[0.125rem] rounded-md border border-[var(--border)] p-2">
            <span class="text-sm font-bold">{path.title}</span>
            <code class="break-all font-mono text-xs text-[var(--foreground)]">{path.path}</code>
            <span class="text-xs text-[var(--muted-foreground)]">{path.note}</span>
          </li>
        {/each}
      </ul>
    </Card>

    <Card>
      <h2 class="mb-3 text-base font-semibold">Приложение</h2>
      <ul class="flex list-none flex-col gap-2 p-0">
        {#each applicationPaths as path (path.key)}
          <li class="flex flex-col gap-[0.125rem] rounded-md border border-[var(--border)] p-2">
            <span class="text-sm font-bold">{path.title}</span>
            <code class="break-all font-mono text-xs text-[var(--foreground)]">{path.path}</code>
            <span class="text-xs text-[var(--muted-foreground)]">{path.note}</span>
          </li>
        {/each}
      </ul>
    </Card>
  {/if}
</ScrollArea>
