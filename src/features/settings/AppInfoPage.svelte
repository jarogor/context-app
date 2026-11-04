<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Button,
    Card,
    ErrorToast,
    ErrorState,
    Icon,
    Skeleton,
    createAsyncState,
  } from '@context/ui';
  import { localize, t } from '@context/i18n';
  import { exportSupportReport } from '../support/report';
  import { invokeCommand } from '../../shared/app-bridge';
  import { formatBytes } from '../../shared/format';

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
    /** Занятое место в байтах; `null` — размер не определён. */
    size_bytes?: number | null;
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

  /** Состояние экспорта логов. */
  const exportState = createAsyncState();

  /** Путь выгруженного файла логов. */
  let exportedPath = $state<string | null>(null);

  /** Экспорт логов приложения. */
  async function exportLogs() {
    exportedPath = null;
    await exportState.run(async () => {
      const path = await exportSupportReport();
      if (path) {
        exportedPath = path;
      }
    });
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
    <!--
      Список — единый лист, а не набор плашек: строки разделяет тонкий
      `--divider`. Рамка вокруг каждой строки в тёмной теме сливалась с
      подложкой карточки и читалась как случайное пятно.
    -->
    <ul class="flex list-none flex-col p-0">
      {#each info.paths as path (path.key)}
        <li
          class="flex flex-col gap-[0.125rem] py-3 [&:not(:first-child)]:border-t [&:not(:first-child)]:border-[var(--divider)]"
          data-testid={`app-path-${path.key}`}
        >
          <span class="flex flex-wrap items-baseline gap-x-2">
            <span class="role-title text-[var(--foreground)]">{localize(path.title)}</span>
            <!--
              Размер стоит рядом с названием: пользователь приходит сюда, чтобы
              понять, сколько место занимает состояние приложения и журнал.
            -->
            {#if formatBytes(path.size_bytes)}
              <span class="role-caption text-[var(--muted-foreground)]" data-testid={`app-path-size-${path.key}`}>
                {formatBytes(path.size_bytes)}
              </span>
            {/if}
          </span>
          <code class="break-all role-mono text-[var(--muted-foreground)]">{path.path}</code>
          {#if localize(path.note)}
            <span class="role-caption text-[var(--muted-foreground)]">{localize(path.note)}</span>
          {/if}
          {#if path.key === 'diagnostics'}
            <!--
              Логи — файл, который пользователь отдаёт при обращении. Путь перед
              действиями, сами действия — рядом.
            -->
            <div class="mt-1 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onclick={openDiagnosticsFolder}>
                <Icon name="folder" />
                {t('app.settings.openFolder')}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={exportState.loading}
                onclick={exportLogs}
              >
                <Icon name="download" />
                {t('app.support.save')}
              </Button>
            </div>
          {/if}
        </li>
      {/each}
    </ul>

    {#if exportedPath}
      <p
        class="mt-3 flex items-start gap-2 break-all rounded-[var(--radius)] bg-[var(--surface-inset)] px-3 py-2 role-caption"
        data-testid="support-report-saved"
      >
        <Icon name="check" class="mt-[0.125rem] h-3.5 w-3.5 flex-none text-[var(--success)]" />
        <span>{t('app.support.saved', { path: exportedPath })}</span>
      </p>
    {/if}
  </Card>
{/if}

<ErrorToast message={exportState.error} />
