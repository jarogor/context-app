<script lang="ts" module>
  /**
   * Поле пути к файлу или каталогу.
   *
   * Путь показывается **одним неразрывным блоком**: у адресов бывают пробелы, и
   * без собственной подложки не видно, где адрес начинается и где заканчивается —
   * кажется, что рядом стоящий текст тоже часть пути. Поэтому сам адрес лежит на
   * врезке (`--code-surface`) со своими полями, а действие копирования стоит
   * рядом, но вне адреса: оно относится к адресу и при этом не входит в него.
   *
   * Длинный адрес переносится внутри врезки по символам, а не обрезается
   * многоточием: на странице книги обрезанный путь выглядел потерянным, и
   * увидеть адрес целиком можно было только подсказкой. `nowrap` оставлен для
   * мест, где строка одна по построению (строка книги): там перенос сломал бы
   * высоту.
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
    /** Блок сжимается по ширине контейнера; по умолчанию — по своему контенту. */
    fit?: boolean;
    /** Адрес не переносится: одна строка по построению места. */
    nowrap?: boolean;
    /** Дополнительные классы контейнера. */
    class?: string;
    /** Метка для тестов у блока адреса. */
    testId?: string;
  }

  let {
    value,
    label = '',
    tone,
    note = '',
    fit = false,
    nowrap = false,
    class: className = '',
    testId,
  }: Props = $props();

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

<div class={cn('flex min-w-0 flex-col gap-1', fit ? 'w-full' : 'w-fit max-w-full', className)}>
  {#if label}
    <span class="role-caption text-[var(--muted-foreground)]">{label}</span>
  {/if}
  <!--
    Расположение — одна залитая подложка: копирование и адрес внутри неё.
    Подложка из полупрозрачного тона чернил, поэтому блок отделяется и на
    странице, и на карточке в обеих темах. У отсутствующей библиотеки вся
    подложка, текст и кнопка получают один предупреждающий тон.

    По умолчанию блок сжимается по своему контенту: короткий адрес не должен
    растягивать полосу на всю ширину. `fit` оставляет прежнее поведение — блок
    занимает доступную ширину.
  -->
  <div
    class="flex min-w-0 items-start gap-1 rounded-[calc(var(--radius)*0.6)] px-0.5 py-0.5 {tone ===
    'danger'
      ? 'bg-[var(--destructive-soft)] text-[var(--destructive)]'
      : 'bg-[var(--code-surface)] text-[var(--foreground)]'}"
  >
    <!-- Копирование внутри подложки: ряд кнопки совпадает со строкой адреса, а
         иконка растёт вместе со шкалой: раньше размер был зашит в rem и на
         широких мониторах кнопка отставала от текста. -->
    <Button
      variant="ghost"
      size="icon"
      class="h-[calc(var(--spacing)*4.5)] w-[calc(var(--spacing)*5)] shrink-0 gap-0 rounded-[calc(var(--radius)*0.6)] p-0 {tone ===
      'danger'
        ? 'text-[var(--destructive)] hover:text-[var(--destructive)]'
        : ''}"
      title={copied ? t('app.library.book.pathCopied') : t('app.library.book.copyPath')}
      ariaLabel={t('app.library.book.copyPath')}
      testId="path-copy"
      onclick={copy}
    >
      <Icon name={copied ? 'check' : 'copy'} class="size-[calc(var(--spacing)*3.5)]" />
    </Button>
    <!-- Сам адрес. Длинный путь переносится по символам внутри врезки: адрес
         остаётся виден целиком, а не превращается в многоточие. В одну строку
         он укладывается только там, где места заведомо одно (`nowrap`). -->
    <span
      class="min-w-0 font-mono text-xs leading-[1.5] {nowrap ? 'truncate' : 'break-all whitespace-pre-wrap'} {fit ? 'flex-1' : ''}"
      title={value}
      data-testid={testId}
    >
      {value}
    </span>
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
