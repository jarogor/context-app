<script lang="ts">
  interface Props {
    onNavigate: (page: string, bookId?: number) => void;
  }

  let { onNavigate }: Props = $props();
</script>

<div class="library">
  <h1>Библиотека</h1>
  <p class="empty-state">Книги ещё не добавлены. Импортируйте EPUB-файл.</p>
</div>

<style>
  .library {
    padding: 24px;
  }
  h1 {
    margin-bottom: 16px;
  }
  .empty-state {
    color: #888;
  }
</style>