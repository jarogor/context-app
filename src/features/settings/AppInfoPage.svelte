<script lang="ts">
  import { onMount } from 'svelte';
  import { Card, ErrorState, ScrollArea, Skeleton } from '@texture/ui';
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

<ScrollArea testId="app-info-page" class="p-4 md:p-6">
  <div class="mx-auto flex w-full max-w-[var(--content-max-width)] flex-col gap-5">
    {#if error}
      <ErrorState message={error} />
    {:else if !info}
      <Skeleton rows={3} rowClass="h-20" />
    {:else}
      <Card class="p-5">
        <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span class="role-heading">{info.name}</span>
          <span class="role-mono text-[var(--muted-foreground)]">версия {info.version}</span>
        </div>
      </Card>

      <Card class="p-5">
        <h2 class="mb-3 role-heading">Файлы приложения</h2>
        <ul class="flex list-none flex-col gap-2 p-0">
          {#each info.paths as path (path.key)}
            <li
              class="flex flex-col gap-[0.125rem] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3"
            >
              <span class="role-title">{path.title}</span>
              <code class="break-all role-mono text-[var(--foreground)]">{path.path}</code>
              <span class="role-caption text-[var(--muted-foreground)]">{path.note}</span>
            </li>
          {/each}
        </ul>
      </Card>
    {/if}
  </div>
</ScrollArea>
