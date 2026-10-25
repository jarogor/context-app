import { describe, expect, it } from 'vitest';

import { bridgeTimings, recordTiming, slowestBridgeTimings } from './bridge-timings';

describe('замеры вызовов моста', () => {
  it('запоминает команду и длительность вызова', () => {
    recordTiming('theme_preference', performance.now() - 25);

    const last = bridgeTimings()[0];
    expect(last.command).toBe('theme_preference');
    expect(last.duration).toBeGreaterThanOrEqual(24);
  });

  it('отдаёт самые медленные вызовы первыми', () => {
    recordTiming('быстрая', performance.now() - 5);
    recordTiming('медленная', performance.now() - 500);

    expect(slowestBridgeTimings(1)[0].command).toBe('медленная');
  });
});
