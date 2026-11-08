<script lang="ts" module>
  /**
   * Поле пути к файлу или каталогу.
   *
   * Путь показывается **одним неразрывным блоком**: у адресов бывают пробелы, и
   * без собственной подложки не видно, где адрес начинается и где заканчивается —
   * кажется, что рядом стоящий текст тоже часть пути. Поэтому сам адрес лежит на
   * врезке (`--surface-inset`) со своими полями и переносится внутри неё, а
   * действие копирования стоит отдельно, вне блока: оно относится к адресу, но
   * не входит в него.
   */
</script>

<script lang="ts">
  import { t } from '@context/i18n';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  import { cn } from '../utils';

  interface Props {
    /** Адрес для показа и копирования. */
    value: string;
    /** Подпись над адресом (необязательна). */
    label?: string;
    /** Адрес выделяется предупреждающим тоном (например, путь отсутствует). */
    tone?: 'danger';
    /** Подпись рядом с адресом (например, «отсутствует»). */
    note?: string;
    /** Дополнительные классы контейнера. */
    class?: string;
    /** Метка для тестов у блока адреса. */
    testId?: string;
  }

  let { value, label = '', tone, note = '', class: className = '', testId }: Props = $props();

  /** Скопирован ли адрес: подтверждение живёт короткое время. */
  let copied = $state(false);

  /** Таймер снятия подтверждения копирования. */
  let copiedTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Копирование адреса в буфер обмена.
   *
   * Буфер может быть недоступен (нет разрешения или небезопасный контекст) —
   * это не ошибка области: подтверждение просто не показывается.
   */
  async function copy() {
    const text = value.trim();
    if (!text || typeof navigator === 'undefined' || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => (copied = false), 1500);
    } catch {
      /* Буфер обмена недоступен — копирование пропускается. */
    }
  }
</script>

<div class={cn('flex min-w-0 flex-col gap-1', className)}>
  {#if label}
    <span class="role-caption text-[var(--muted-foreground)]">{label}</span>
  {/if}
  <div class="flex min-w-0 items-start gap-1.5">
    <!-- Сам адрес: отдельная врезка, поэтому границы значения видны даже с пробелами. -->
    <span
      class="min-w-0 flex-1 break-all rounded-[var(--radius)] bg-[var(--surface-inset)] px-2 py-1.5 font-mono text-xs leading-[1.5] {tone ===
      'danger'
        ? 'text-[var(--destructive)]'
        : 'text-[var(--foreground)]'}"
      data-testid={testId}
    >
      {value}
    </span>
    <Button
      variant="ghost"
      size="sm"
      class="shrink-0 px-1"
      title={copied ? t('app.library.book.pathCopied') : t('app.library.book.copyPath')}
      ariaLabel={t('app.library.book.copyPath')}
      testId="path-copy"
      onclick={copy}
    >
      <Icon name={copied ? 'check' : 'copy'} class="h-3.5 w-3.5" />
    </Button>
  </div>
  {#if note}
    <span
      class="role-caption {tone === 'danger'
        ? 'text-[var(--destructive)]'
        : 'text-[var(--muted-foreground)]'}"
    >
      {note}
    </span>
  {/if}
</div>
