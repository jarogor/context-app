<script lang="ts">
  import { onMount } from 'svelte';
  import type { Entry } from '../types';

  interface Props {
    entries: Entry[];
    technicalVisible: boolean;
    markAllRead: () => void;
    clear: () => void;
    onBack: () => void;
  }

  let { entries, technicalVisible = $bindable(false), markAllRead, clear, onBack }: Props =
    $props();

  /** Отфильтрованные записи: без технического уровня показываем только User. */
  let visibleEntries = $derived(
    technicalVisible ? entries : entries.filter((entry) => entry.level === 'User'),
  );

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(
    entries.filter((entry) => entry.level === 'User' && !entry.read).length,
  );

  function handleCounterClick() {
    markAllRead();
  }

  onMount(() => {
    markAllRead();
  });
</script>

<header class="notifications-header">
  <button class="back-button" type="button" onclick={onBack}>← Назад</button>
  <h1>Уведомления</h1>
  <button class="notification-count" type="button" onclick={handleCounterClick} title="Прочитать все">
    {unreadUser}
  </button>
</header>

<div class="notifications-content">
  <div class="controls">
    <label>
      <input type="checkbox" bind:checked={technicalVisible} />
      Технические
    </label>
    <button type="button" onclick={clear}>Очистить</button>
  </div>

  {#if visibleEntries.length === 0}
    <div class="empty-state">Нет уведомлений</div>
  {:else}
    <div class="notifications-list">
      {#each visibleEntries as entry (entry.id)}
        <div class="notification-item {entry.level} {entry.severity} {entry.read ? 'read' : ''}">
          <span class="level-badge">{entry.level === 'User' ? 'User' : 'Tech'}</span>
          <span class="message">{entry.message}</span>
          <span class="timestamp">{new Date(entry.timestamp).toLocaleTimeString()}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .notifications-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 16px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f8f8;
  }

  .notifications-header h1 {
    margin: 0;
    font-size: 18px;
  }

  .back-button {
    padding: 6px 10px;
    border: 1px solid #d0d0d0;
    border-radius: 6px;
    background: #fff;
    font: inherit;
    cursor: pointer;
  }

  .notification-count {
    background: #4caf50;
    color: white;
    padding: 4px 12px;
    border: none;
    border-radius: 12px;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
  }

  .notifications-content {
    padding: 16px;
  }

  .controls {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    flex-wrap: wrap;
  }

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    cursor: pointer;
  }

  button {
    cursor: pointer;
  }

  .controls button {
    padding: 6px 12px;
    font-size: 14px;
  }

  .notifications-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .notification-item {
    padding: 12px;
    border-radius: 4px;
    background: #fff;
    border: 1px solid #e0e0e0;
    animation: notification-in 0.25s ease;
  }

  @keyframes notification-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .notification-item.read {
    opacity: 0.6;
  }

  .notification-item.User {
    border-left: 3px solid #4caf50;
  }

  .notification-item.Technical {
    border-left: 3px solid #2196f3;
  }

  .notification-item.Error {
    border-left: 3px solid #f44336;
  }

  .notification-item.Warn {
    border-left: 3px solid #ff9800;
  }

  .level-badge {
    display: inline-block;
    padding: 2px 6px;
    font-size: 10px;
    font-weight: bold;
    color: white;
    background: #ccc;
    margin-right: 8px;
    border-radius: 2px;
  }

  .notification-item.User .level-badge {
    background: #4caf50;
  }

  .notification-item.Technical .level-badge {
    background: #2196f3;
  }

  .message {
    word-break: break-word;
  }

  .timestamp {
    display: block;
    font-size: 11px;
    color: #999;
    margin-top: 4px;
  }

  .empty-state {
    text-align: center;
    color: #999;
    padding: 40px 16px;
  }
</style>
