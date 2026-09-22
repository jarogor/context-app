<script lang="ts">
  import type { Entry } from './types';

  interface Props {
    entries: Entry[];
    technicalVisible: boolean;
    collapsed: boolean;
    markAllRead: () => void;
    clear: () => void;
    onToggle: () => void;
  }

  let {
    entries,
    technicalVisible = $bindable(false),
    collapsed = $bindable(true),
    markAllRead,
    clear,
    onToggle,
  }: Props = $props();

  /** Отфильтрованные записи: без технического уровня показываем только User. */
  let visibleEntries = $derived(
    technicalVisible ? entries : entries.filter((entry) => entry.level === 'User'),
  );

  /** Количество непрочитанных пользовательских уведомлений. */
  let unreadUser = $derived(entries.filter((entry) => entry.level === 'User' && !entry.read).length);

  /** Разворачивание или сворачивание панели. */
  function toggle() {
    collapsed = !collapsed;
    onToggle();
  }
</script>

{#if collapsed}
  <div class="notifications-panel collapsed" onclick={toggle} onkeydown={toggle} role="button" tabindex="0" title="Уведомления">
    <span class="collapsed-label">Уведомления</span>
    <span class="count-badge">{unreadUser}</span>
  </div>
{:else}
  <div class="notifications-panel expanded">
    <div class="panel-header">
      <span>Уведомления</span>
      <div class="panel-controls">
        <label>
          <input type="checkbox" bind:checked={technicalVisible} />
          Технические
        </label>
        <button type="button" onclick={clear}>Очистить</button>
        <button type="button" onclick={toggle} title="Свернуть">×</button>
      </div>
    </div>
    <div class="notifications-list">
      {#if visibleEntries.length === 0}
        <div class="empty-state">Нет уведомлений</div>
      {:else}
        {#each visibleEntries as entry (entry.id)}
          <div class="notification-item {entry.level} {entry.severity} {entry.read ? 'read' : ''}">
            <span class="level-badge">{entry.level === 'User' ? 'User' : 'Tech'}</span>
            <span class="message">{entry.message}</span>
            <span class="timestamp">{new Date(entry.timestamp).toLocaleTimeString()}</span>
          </div>
        {/each}
      {/if}
    </div>
  </div>
{/if}

<style>
  .notifications-panel {
    box-sizing: border-box;
    height: 100vh;
    background: #fff;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .notifications-panel.collapsed {
    width: 100%;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    padding-top: 16px;
    cursor: pointer;
    background: #f0f0f0;
  }

  .notifications-panel.collapsed:hover {
    background: #e4e4e4;
  }

  .collapsed-label {
    writing-mode: vertical-rl;
    font-size: 12px;
    color: #555;
    letter-spacing: 1px;
  }

  .notifications-panel.expanded {
    width: 100%;
  }

  .count-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 24px;
    padding: 0 6px;
    border-radius: 12px;
    background: #4caf50;
    color: #fff;
    font-size: 13px;
    font-weight: bold;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    border-bottom: 1px solid #e0e0e0;
    background: #f8f8f8;
  }

  .panel-controls {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  label {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 13px;
    cursor: pointer;
  }

  button {
    padding: 4px 8px;
    font-size: 12px;
    cursor: pointer;
  }

  button:hover {
    background: #e0e0e0;
  }

  .notifications-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .notification-item {
    padding: 8px;
    margin-bottom: 8px;
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
    padding: 24px 8px;
  }
</style>
