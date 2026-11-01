/** Отчёт о работе приложения: сборка в ядре и сохранение в файл.
 *
 * Пользователь не эксперт и не знает, что смотреть при сбое. Приложение само
 * собирает отчёт — версию, платформу, плагины и журнал диагностики — и
 * сохраняет его одним файлом, который достаточно приложить к обращению.
 * Модуль чист от Svelte и пригоден для тестов.
 */

import { invokeCommand } from '../../shared/app-bridge';

/** Собранный отчёт. */
export interface SupportReport {
  /** Предлагаемое имя файла. */
  file_name: string;
  /** Текст отчёта. */
  content: string;
}

/** Сборка отчёта в ядре. */
export async function buildSupportReport(): Promise<SupportReport> {
  return (await invokeCommand('support_report', {})) as SupportReport;
}

/** Сохранение отчёта в выбранный пользователем файл.
 *
 * Место выбирает системный диалог: пользователю не нужно знать, куда именно
 * пишет приложение. Возвращается путь записанного файла или `null`, если выбор
 * отменён.
 */
export async function saveSupportReport(report: SupportReport): Promise<string | null> {
  return (await invokeCommand('support_report_save', { report })) as string | null;
}

/** Сборка и сохранение отчёта одним действием.
 *
 * Возвращает путь файла или `null`, если пользователь отменил сохранение.
 * Ошибку сборки или записи вызывающий показывает сам.
 */
export async function exportSupportReport(): Promise<string | null> {
  const report = await buildSupportReport();
  return saveSupportReport(report);
}
