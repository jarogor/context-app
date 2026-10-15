import type { Page } from '@playwright/test';

/** Результат проверки достижимости нижнего края области прокруткой. */
export interface BottomReachability {
    /** Есть ли у области собственный контейнер прокрутки. */
    ok: boolean;
    /** Причина недостижимости (для диагностики падения). */
    reason?: string;
    /** Смещение прокрутки после перехода к нижнему краю. */
    scrollTop?: number;
    /** Нижняя граница последнего элемента содержимого. */
    lastBottom?: number;
    /** Нижняя граница контейнера прокрутки. */
    scrollerBottom?: number;
}

/** Проверка, что нижний край содержимого области достижим прокруткой.
 *
 * Контейнером прокрутки считается ближайший предок-прокрутка или сам корень
 * области. Высота содержимого берётся такой, чтобы переполнять область;
 * проверяется, что область прокручивается (есть `overflow-y: auto|scroll`),
 * смещение меняется, а последний элемент оказывается в границах контейнера.
 */
export async function bottomReachable(page: Page, selector: string): Promise<BottomReachability> {
    return await page.evaluate((target) => {
        const root = document.querySelector(target);
        if (!root) {
            return { ok: false, reason: 'не найден корень области' };
        }
        let node: Element | null = root;
        let scroller: HTMLElement | null = null;
        while (node && node !== document.body) {
            const overflowY = getComputedStyle(node).overflowY;
            const element = node as HTMLElement;
            if (
                (overflowY === 'auto' || overflowY === 'scroll') &&
                element.scrollHeight > element.clientHeight + 1
            ) {
                scroller = element;
                break;
            }
            node = node.parentElement;
        }
        if (!scroller) {
            return { ok: false, reason: 'нет контейнера прокрутки у области' };
        }
        scroller.scrollTop = scroller.scrollHeight;
        // Нижний край содержимого — самый низкий элемент внутри корня.
        const descendants = Array.from(root.querySelectorAll('*')) as HTMLElement[];
        let last: HTMLElement | null = null;
        for (const element of descendants) {
            const box = element.getBoundingClientRect();
            if (!last || box.bottom > last.getBoundingClientRect().bottom) {
                last = element;
            }
        }
        if (!last) {
            return { ok: false, reason: 'нет содержимого области' };
        }
        const lastBox = last.getBoundingClientRect();
        const scrollerBox = scroller.getBoundingClientRect();
        return {
            ok: true,
            scrollTop: scroller.scrollTop,
            lastBottom: lastBox.bottom,
            scrollerBottom: scrollerBox.bottom,
        };
    }, selector);
}
