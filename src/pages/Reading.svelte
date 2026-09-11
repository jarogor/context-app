<script lang="ts">
  interface Props {
    bookId: number;
    onNavigate: (page: string, bookId?: number) => void;
  }

  let { bookId, onNavigate }: Props = $props();
</script>

<div class="reading">
  <button class="back-btn" onclick={() => onNavigate("library")}>
    ← Назад к списку
  </button>
  <h1>Чтение</h1>
  <p>Содержимое книги #{bookId} (заглушка)</p>
</div>

<style>
  .reading {
    padding: 24px;
  }
  .back-btn {
    margin-bottom: 16px;
    cursor: pointer;
    background: none;
    border: none;
    color: #5a8fda;
    font-size: 14px;
  }
  .back-btn:hover {
    text-decoration: underline;
  }
</style>