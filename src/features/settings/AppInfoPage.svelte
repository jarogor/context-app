<script lang="ts">
  import { onMount } from 'svelte';
  import { Card, ErrorState, Skeleton } from '@context/ui';
  import { localize, t } from '@context/i18n';
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

{#if error}
  <ErrorState message={error} />
{:else if !info}
  <Card class="p-5">
    <Skeleton rows={2} rowClass="h-16" />
  </Card>
{:else}
  <Card class="p-5">
    <h2 class="mb-3 role-heading">{t('app.settings.dataLocation')}</h2>
    <ul class="flex list-none flex-col gap-2 p-0">
      {#each info.paths as path (path.key)}
        <li
          class="flex flex-col gap-[0.125rem] rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3"
        >
          <code class="break-all role-mono text-[var(--foreground)]">{path.path}</code>
          <span class="role-caption text-[var(--muted-foreground)]">{localize(path.note)}</span>
        </li>
      {/each}
    </ul>
  </Card>
{/if}
