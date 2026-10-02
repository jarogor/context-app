/** Подготовка окружения модульных тестов.
 *
 * jsdom не предоставляет `ResizeObserver`, который использует Svelte для
 * привязок `bind:clientWidth`/`bind:clientHeight`. Заглушка нужна только
 * тестам: в приложении и браузерных сценариях доступен настоящий наблюдатель.
 */
class ResizeObserverStub {
  /** Подписка на изменения размера (не требуется заглушке). */
  observe(): void {}

  /** Отмена подписки (не требуется заглушке). */
  unobserve(): void {}

  /** Прекращение наблюдения (не требуется заглушке). */
  disconnect(): void {}
}

if (!('ResizeObserver' in globalThis)) {
  (globalThis as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}
