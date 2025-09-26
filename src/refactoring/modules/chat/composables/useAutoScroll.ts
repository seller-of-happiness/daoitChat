/**
 * Композибл для автоматического скролла сообщений
 */

import { ref, nextTick } from 'vue'

export function useAutoScroll(containerSelector: string = '#chat-messages') {
    const autoScroll = ref(true)
    const BOTTOM_THRESHOLD_PX = 32

    const getContainer = (): HTMLElement | null => {
        return document.querySelector(containerSelector)
    }

    const isNearBottom = (): boolean => {
        const container = getContainer()
        if (!container) return false

        const { scrollTop, scrollHeight, clientHeight } = container
        return scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD_PX
    }

    const scrollToBottom = (smooth = false): void => {
        nextTick(() => {
            const container = getContainer()
            if (!container) return

            container.scrollTo({
                top: container.scrollHeight,
                behavior: smooth ? 'smooth' : 'auto',
            })
        })
    }

    const handleScroll = (): void => {
        autoScroll.value = isNearBottom()
    }

    const checkAndAutoScroll = (): void => {
        if (autoScroll.value) {
            scrollToBottom()
        }
    }

    return {
        autoScroll,
        scrollToBottom,
        handleScroll,
        checkAndAutoScroll,
        isNearBottom,
    }
}
