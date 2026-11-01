<script lang="ts">
  import { Button, Card, ErrorToast, Icon, createAsyncState } from '@context/ui';
  import { t } from '@context/i18n';
  import { exportSupportReport } from './report';

  /**
   * Отчёт о работе приложения.
   *
   * Описание говорит, что лежит в файле, а не пересказывает работу кнопки.
   */
  /** Состояние операции сохранения. */
  const asyncState = createAsyncState();

  /** Путь сохранённого файла: показывается, чтобы его легко было найти. */
  let savedPath = $state<string | null>(null);

  /** Сборка и сохранение отчёта. */
  async function save() {
    savedPath = null;
    await asyncState.run(async () => {
      const path = await exportSupportReport();
      if (path) {
        savedPath = path;
      }
    });
  }
</script>

<div data-testid="support-report">
  <Card class="p-5">
  <div class="mb-3 flex flex-col gap-0.5">
    <h2 class="role-heading">{t('app.support.title')}</h2>
    <span class="role-caption text-[var(--muted-foreground)]">{t('app.support.description')}</span>
  </div>

  <Button variant="primary" onclick={save} disabled={asyncState.loading}>
    <Icon name="download" />
    {t('app.support.save')}
  </Button>

  {#if savedPath}
    <p
      class="mt-3 flex items-start gap-2 break-all rounded-[var(--radius)] bg-[var(--surface-inset)] px-3 py-2 role-caption"
      data-testid="support-report-saved"
    >
      <Icon name="check" class="mt-[0.125rem] h-3.5 w-3.5 flex-none text-[var(--success)]" />
      <span>{t('app.support.saved', { path: savedPath })}</span>
    </p>
  {/if}
  </Card>
</div>

<ErrorToast message={asyncState.error} />
