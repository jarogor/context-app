<script lang="ts">
  import { onMount } from 'svelte';
  import { Button, Card, ErrorState, Icon, Skeleton } from '@context/ui';
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

  /** Открытие папки с журналом диагностики системным файловым менеджером. */
  async function openDiagnosticsFolder() {
    try {
      await invokeCommand('diagnostics_open_folder', {});
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
          class="flex flex-col gap-[0.125rem] rounded-[var(--radius)] bg-[var(--surface-inset)] p-3"
          data-testid={`app-path-${path.key}`}
        >
          <span class="role-title text-[var(--foreground)]">{localize(path.title)}</span>
          <code class="break-all role-mono text-[var(--muted-foreground)]">{path.path}</code>
          <span class="role-caption text-[var(--muted-foreground)]">{localize(path.note)}</span>
          {#if path.key === 'diagnostics'}
            <!--
              Журнал — единственный файл, который пользователю нужно найти
              самому, чтобы приложить к обращению. Путь виден выше, а кнопка
              избавляет от набора пути вручную.
            -->
            <div class="mt-1">
              <Button variant="secondary" size="sm" onclick={openDiagnosticsFolder}>
                <Icon name="folder" />
                {t('app.settings.openFolder')}
              </Button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  </Card>
{/if}
