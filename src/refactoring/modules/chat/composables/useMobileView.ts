/**
 * Композибл для мобильной адаптации чата
 */

import { ref, onMounted, onUnmounted } from 'vue'

export type MobileViewType = 'list' | 'chat'

export function useMobileView() {
    const isMobile = ref(false)
    const mobileView = ref<MobileViewType>('list')

    let mediaQueryList: MediaQueryList | null = null

    const updateIsMobile = () => {
        if (mediaQueryList) {
            isMobile.value = mediaQueryList.matches
            // На мобильных устройствах по умолчанию показываем список
            if (isMobile.value && mobileView.value === 'chat') {
                mobileView.value = 'list'
            }
        }
    }

    const showChatView = () => {
        if (isMobile.value) {
            mobileView.value = 'chat'
        }
    }

    const showListView = () => {
        if (isMobile.value) {
            mobileView.value = 'list'
        }
    }

    onMounted(() => {
        if (window.matchMedia) {
            mediaQueryList = window.matchMedia('(max-width: 768px)')
            updateIsMobile()

            // Добавляем слушатель изменений
            if (mediaQueryList.addEventListener) {
                mediaQueryList.addEventListener('change', updateIsMobile)
            } else {
                // Fallback для старых браузеров
                mediaQueryList.addListener(updateIsMobile)
            }
        }
    })

    onUnmounted(() => {
        if (mediaQueryList) {
            if (mediaQueryList.removeEventListener) {
                mediaQueryList.removeEventListener('change', updateIsMobile)
            } else {
                // Fallback для старых браузеров
                mediaQueryList.removeListener(updateIsMobile)
            }
        }
    })

    return {
        isMobile,
        mobileView,
        showChatView,
        showListView,
    }
}
