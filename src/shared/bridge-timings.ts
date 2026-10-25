/** Замер задержек вызовов моста для диагностики отзывчивости интерфейса.
 *
 * Проблема, которую он отслеживает: после сохранения настроек главный поток
 * остаётся занятым, и следующий клик приходит с опозданием. Задержка может быть
 * в двух местах — в ожидании ответа ядра (команда долго не возвращается) или в
 * самом webview (ответ пришёл, но кадр не отрисован). Этот модуль измеряет
 * первое и складывает последние замеры, чтобы их можно было посмотреть в
 * консоли вызовом `contextBridgeTimings()`.
 */

/** Один замер вызова команды. */
export interface BridgeTiming {
  /** Имя команды. */
  command: string;
  /** Сколько миллисекунд занял вызов вместе с ответом. */
  duration: number;
  /** Момент начала вызова (мс от старта страницы). */
  startedAt: number;
}

/** Сколько последних замеров хранится. */
const KEEP = 200;

/** Последние замеры вызовов. */
const timings: BridgeTiming[] = [];

/** Запись замера вызова команды. */
export function recordTiming(command: string, startedAt: number): void {
  const timing: BridgeTiming = {
    command,
    duration: Math.round(performance.now() - startedAt),
    startedAt: Math.round(startedAt),
  };
  timings.push(timing);
  if (timings.length > KEEP) {
    timings.shift();
  }
}

/** Последние замеры вызовов, от новых к старым. */
export function bridgeTimings(): BridgeTiming[] {
  return [...timings].reverse();
}

/** Самые медленные вызовы из последних замеров. */
export function slowestBridgeTimings(limit = 10): BridgeTiming[] {
  return [...timings].sort((left, right) => right.duration - left.duration).slice(0, limit);
}

/** Публикация диагностики в глобальную область окна.
 *
 * Вызывается один раз при старте приложения: в консоли webview доступны
 * `contextBridgeTimings()` и `contextSlowestBridgeTimings()`.
 */
export function exposeBridgeTimings(): void {
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.contextBridgeTimings = bridgeTimings;
  scope.contextSlowestBridgeTimings = slowestBridgeTimings;
}
