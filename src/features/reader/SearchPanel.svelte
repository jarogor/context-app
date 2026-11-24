<script lang="ts">
  import { t } from '@context/i18n';
  import { SidePanel } from '@context/ui';
  import type { SearchState } from '../reader/search-state';
  import ReaderSearchBar from '../reader/ReaderSearchBar.svelte';

  /** Панель поиска по книге.
   *
   * Отдельная панель, а не вкладка панели книги: поиск — самостоятельное
   * действие над книгой, и его кнопка на панели вкладки не должна зажигать
   * заодно кнопку книги. Здесь же он будет расширяться — например, поиском по
   * всем книгам, — не задевая разделы файла.
   */

  interface Props {
    /** Текущий запрос. */
    query?: string;
    /** Состояние поиска: сколько найдено и к какому вхождению ведёт переход. */
    state: SearchState;
    /** Идёт ли поиск. */
    busy?: boolean;
    /** Ошибка поиска. */
    error?: string | null;
    /** Изменение запроса. */
    onQuery?: (value: string) => void;
    /** Переход к соседнему вхождению. */
    onStep?: (delta: 1 | -1) => void;
    /** Закрытие панели. */
    onClose?: () => void;
  }

  let {
    query = '',
    state,
    busy = false,
    error = null,
    onQuery,
    onStep,
    onClose,
  }: Props = $props();
</script>

<SidePanel
  title={t('app.reader.searchShort')}
  testId="search-panel"
  side="left"
  showSearch={false}
  responsive={false}
  class="w-[var(--properties-panel-width)]"
  {onClose}
>
  <!--
    Поле поиска — тот же компонент, что и раньше: лупа и очистка уже в нём,
    счётчик и переходы — ниже. Панель только держит его и не дублирует логику
    поиска: ищет область чтения.
  -->
  <ReaderSearchBar {query} {state} {busy} {error} {onQuery} {onStep} />
</SidePanel>
