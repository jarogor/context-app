/** Единое форматирование значений для списков поверхностей.
 *
 * Дата в русском виде: `ДД.ММ.ГГГГ чч:мм` (двухзначные день, месяц, час и
 * минута; 24-часовой формат). Формат задаётся вручную, а не через локаль
 * окружения: интернационализации интерфейса пока нет, весь текст русский, и
 * системная локаль (например, en-US) давала бы чужой порядок частей. Когда
 * появится выбор языка интерфейса, формат даты должен следовать выбранному
 * языку — это внесено в план (`ROADMAP.md`).
 */

/** Двухзначное число с ведущим нулём. */
function pad(value: number): string {
    return String(value).padStart(2, '0');
}

/** Дата и время в русском формате `ДД.ММ.ГГГГ чч:мм`; ноль даёт пустую строку. */
export function formatDateTime(millis: number): string {
    if (!millis) {
        return '';
    }
    const date = new Date(millis);
    return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()} ${pad(
        date.getHours(),
    )}:${pad(date.getMinutes())}`;
}

/** Время в русском 24-часовом формате `чч:мм:сс`; ноль даёт пустую строку. */
export function formatTime(millis: number): string {
    if (!millis) {
        return '';
    }
    const date = new Date(millis);
    return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
