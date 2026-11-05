import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyCoreUpdate,
  checkCoreUpdate,
  loadUpdateStatus,
  quitForCoreUpdate,
  restartApplication,
  saveCheckOnStartup,
  saveUpdateSource,
  skipCoreUpdate,
} from './update';
import { invokeCommand } from '../../shared/app-bridge';

vi.mock('../../shared/app-bridge', () => ({
  invokeCommand: vi.fn(),
}));

const invoke = vi.mocked(invokeCommand);

beforeEach(() => {
  invoke.mockReset();
});

describe('клиент обновлений', () => {
  it('читает состояние обновлений', async () => {
    invoke.mockResolvedValueOnce({
      current_version: '0.1.0',
      config: { source: null, check_on_startup: true, skipped_version: null },
      last_check: null,
    });

    const status = await loadUpdateStatus();

    expect(invoke).toHaveBeenCalledWith('update_status', {});
    expect(status.current_version).toBe('0.1.0');
  });

  it('сохраняет источник и признак проверки', async () => {
    invoke.mockResolvedValue({ source: null, check_on_startup: true, skipped_version: null });

    await saveUpdateSource({ kind: 'network', location: 'https://example.com/updates' });
    await saveCheckOnStartup(false);

    expect(invoke).toHaveBeenNthCalledWith(1, 'update_source_set', {
      source: { kind: 'network', location: 'https://example.com/updates' },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'update_check_on_startup_set', {
      enabled: false,
    });
  });

  it('проверяет, устанавливает и пропускает версию ядра', async () => {
    invoke.mockResolvedValueOnce({
      source: null,
      core: null,
      checked_at_millis: 0,
      errors: [],
    });
    invoke.mockResolvedValueOnce({
      version: '0.2.0',
      restart_required: true,
      log_path: '/tmp/log',
    });
    invoke.mockResolvedValueOnce({
      source: null,
      check_on_startup: true,
      skipped_version: '0.2.0',
    });

    await checkCoreUpdate();
    await applyCoreUpdate();
    await skipCoreUpdate('0.2.0');

    expect(invoke).toHaveBeenNthCalledWith(1, 'update_check', {});
    expect(invoke).toHaveBeenNthCalledWith(2, 'update_apply', {});
    expect(invoke).toHaveBeenNthCalledWith(3, 'update_skip', { version: '0.2.0' });
  });

  it('перезапускает приложение и завершает его после обновления ядра', async () => {
    invoke.mockResolvedValue(null);

    await restartApplication();
    await quitForCoreUpdate();

    expect(invoke).toHaveBeenNthCalledWith(1, 'update_restart', {});
    expect(invoke).toHaveBeenNthCalledWith(2, 'update_quit', {});
  });
});
