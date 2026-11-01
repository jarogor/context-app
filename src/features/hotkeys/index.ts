/** Единственный экземпляр диспетчера клавиатуры приложения.
 *
 * Оболочка, рабочее место и чтение регистрируют свои действия в одном
 * диспетчере, поэтому реестр привязок и проверка конфликтов существуют в
 * приложении ровно в одном месте. Отдельный создаваемый диспетчер
 * (`createHotkeyDispatcher`) нужен тестам.
 */

import { createHotkeyDispatcher, type HotkeyDispatcher } from './dispatcher';

/** Диспетчер клавиатуры приложения. */
export const hotkeys: HotkeyDispatcher = createHotkeyDispatcher();
