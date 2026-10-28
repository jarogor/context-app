<script lang="ts">
  import { Badge, Button, Dialog } from '@context/ui';
  import type { PluginUpdate } from '../store/plugin-store';
  import type { AvailableCore } from './update';

  interface Props {
    /** Открытость диалога. */
    open?: boolean;
    /** Доступное обновление ядра. */
    core: AvailableCore | null;
    /** Доступные обновления прикладных плагинов. */
    plugins: PluginUpdate[];
    /** Текущая версия приложения. */
    currentVersion: string;
    /** Идёт ли установка. */
    busy: boolean;
    /** Ошибка установки. */
    error: string;
    /** Обновление подготовлено и ждёт перезапуска. */
    done: boolean;
    /** Запуск установки. */
    onApply: () => void;
    /** Закрытие без установки. */
    onLater: () => void;
    /** Отказ от предлагаемой версии ядра. */
    onSkip: () => void;
    /** Перезапуск после установки. */
    onRestart: () => void;
  }

  let {
    open = $bindable(false),
    core,
    plugins,
    currentVersion,
    busy,
    error,
    done,
    onApply,
    onLater,
    onSkip,
    onRestart,
  }: Props = $props();

  /** Заголовок диалога по состоянию установки. */
  const title = $derived(done ? 'Обновление готово' : 'Доступно обновление');

  /** Есть ли что устанавливать. */
  const hasUpdates = $derived(core !== null || plugins.length > 0);
</script>

<Dialog bind:open {title} showClose={!busy} onOpenChange={(value) => !value && onLater()}>
  {#if done}
    <p class="role-body">
      Обновление установлено. Перезапустите приложение, чтобы продолжить работу в новой версии.
    </p>
  {:else if hasUpdates}
    {#if core}
      <div class="flex flex-col gap-1" data-testid="update-core">
        <div class="flex flex-wrap items-center gap-2">
          <span class="role-title">Приложение</span>
          <Badge variant="outline">{currentVersion} → {core.version}</Badge>
        </div>
        {#if core.notes}
          <p class="role-caption text-[var(--muted-foreground)]">{core.notes}</p>
        {/if}
      </div>
    {/if}

    {#if plugins.length > 0}
      <div class="flex flex-col gap-1.5" data-testid="update-plugins">
        <span class="role-title">Плагины</span>
        <ul class="flex list-none flex-col gap-1 p-0">
          {#each plugins as plugin (plugin.store + ':' + plugin.name)}
            <li class="flex flex-wrap items-center gap-2">
              <span class="role-body">{plugin.package.name || plugin.name}</span>
              <Badge variant="outline">
                {plugin.current_version} → {plugin.package.version || '—'}
              </Badge>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if error}
      <p class="role-body text-[var(--destructive)]" data-testid="update-error">{error}</p>
    {/if}

    <div class="flex flex-wrap justify-end gap-2">
      {#if core}
        <Button variant="ghost" disabled={busy} onclick={onSkip}>Не предлагать</Button>
      {/if}
      <Button variant="secondary" disabled={busy} onclick={onLater}>Позже</Button>
      <Button variant="primary" disabled={busy} onclick={onApply}>
        {busy ? 'Обновление…' : 'Обновить'}
      </Button>
    </div>
  {:else}
    <p class="role-body text-[var(--muted-foreground)]">Обновлений нет.</p>
    <div class="flex justify-end">
      <Button variant="secondary" onclick={onLater}>Закрыть</Button>
    </div>
  {/if}

  {#if done}
    <div class="flex justify-end">
      <Button variant="primary" onclick={onRestart}>Перезапустить</Button>
    </div>
  {/if}
</Dialog>
