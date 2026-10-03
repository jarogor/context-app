/** Клиент декларативного интерфейса настроек.
 *
 * Оболочка не знает о типах полей: базовый плагин настроек отдаёт декларации
 * `ui-schema`, а оболочка валидирует их каталогом и рендерит единым рендерером.
 * Модуль чист от Svelte и пригоден для тестов.
 */

import {
  sanitizeDeclaration,
  UI_SCHEMA_VERSION,
  type UiIntent,
  type UiSpaceDeclaration,
} from '@texture/ui-schema';
import { invokeCommand } from './app-bridge';

/** Capability базового плагина настроек. */
export const SETTINGS_CAPABILITY = 'settings.store@1';

/** Диагностика несовместимой версии схемы интерфейса или `null`. */
export function versionDiagnostic(version: number): string | null {
  if (version !== UI_SCHEMA_VERSION) {
    return `Несовместимая версия схемы интерфейса: ${version} (поддерживается ${UI_SCHEMA_VERSION})`;
  }
  return null;
}

/** Ответ плагина с декларациями пространств и необязательной ошибкой действия. */
export interface SettingsUiResponse {
  /** Версия схемы интерфейса от плагина. */
  version: number;
  /** Декларации пространств. */
  spaces: UiSpaceDeclaration[];
  /** Ошибка выполнения действия, если она есть. */
  error?: string;
}

/** Вызов opaque-операции базового плагина настроек. */
async function operation<T>(action: string, payload: unknown = {}): Promise<T> {
  return (await invokeCommand('invoke_base_plugin_operation', {
    capability: SETTINGS_CAPABILITY,
    operation: action,
    payload,
  })) as T;
}

/** Нормализованная декларация с диагностикой отклонённых узлов. */
export interface NormalizedDeclaration {
  /** Очищенная декларация или `null`, если пространство не объявлено. */
  declaration: UiSpaceDeclaration | null;
  /** Диагностика отклонённых элементов. */
  diagnostics: string[];
}

/** Проверка и очистка одной декларации от плагина. */
export function normalizeDeclaration(declaration: UiSpaceDeclaration): NormalizedDeclaration {
  const { declaration: sanitized, diagnostics } = sanitizeDeclaration(declaration);
  return { declaration: sanitized, diagnostics };
}

/** Загрузка и нормализация деклараций интерфейса настроек. */
export async function loadSettingsUi(): Promise<{
  declarations: NormalizedDeclaration[];
  error: string;
}> {
  const response = await operation<SettingsUiResponse>('ui', {});
  const versionError = versionDiagnostic(response.version);
  if (versionError) {
    return { declarations: [], error: versionError };
  }
  const declarations = (response.spaces ?? []).map(normalizeDeclaration);
  return { declarations, error: response.error ?? '' };
}

/** Сохранение значений секции настроек.
 *
 * Используется оболочкой для собственного поведения (например, переключателя
 * оформления в шапке), не проходя через UI-интент: значение пишется напрямую и
 * публикуется событие `settings:changed`.
 */
export async function saveSettingsValues(
  section: string,
  values: Record<string, unknown>,
): Promise<void> {
  await operation('set', { section, values });
}

/** Передача интента интерфейса настроек плагину. */
export async function sendSettingsIntent(
  intent: UiIntent,
): Promise<{ declarations: NormalizedDeclaration[]; error: string }> {
  const response = await operation<SettingsUiResponse>('intent', intent);
  const versionError = versionDiagnostic(response.version);
  if (versionError) {
    return { declarations: [], error: versionError };
  }
  const declarations = (response.spaces ?? []).map(normalizeDeclaration);
  return { declarations, error: response.error ?? '' };
}
