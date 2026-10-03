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

/** Поддельный список медиа-запросов: jsdom не предоставляет `matchMedia`.
 *
 * Тема `system` подписывается на `(prefers-color-scheme: dark)`; в тестах
 * достаточно объекта без событий и с предпочтением светлой темы.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  const matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
  (window as { matchMedia: unknown }).matchMedia = matchMedia;
}
