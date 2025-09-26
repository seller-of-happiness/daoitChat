/**
 * Упрощенный композибл для интерфейса чата
 * Заменяет сложный useChatLogic
 */

import { onMounted, onUnmounted } from 'vue'
import { useChatCore } from './useChatCore'
import { useMessageGroups } from './useMessageGroups'
import { useMobileView } from './useMobileView'
import { useAutoScroll } from './useAutoScroll'
import { useCurrentUser } from './useCurrentUser'
import type { IChat } from '../types/IChat'

interface ChatInterfaceOptions {
    /** ID пользователя для создания диалога при инициализации */
    userId?: string
    /** ID чата для открытия при инициализации */
    initialChatId?: number
    /** Селектор контейнера сообщений */
    messagesContainerSelector?: string
}

export function useChatInterface(options: ChatInterfaceOptions = {}) {
    // === Core chat functionality ===
    const chatCore = useChatCore()
    const currentUser = useCurrentUser()

    // === UI helpers ===
    const mobileView = useMobileView()
    const autoScroll = useAutoScroll(options.messagesContainerSelector)
    const messageGroups = useMessageGroups(() => chatCore.messages.value)

    // === Initialization ===
    const initialize = async (): Promise<void> => {
        await chatCore.initialize()

        // Если указан userId, создаем диалог
        if (options.userId) {
            await chatCore.createDialog(options.userId)
        }

        // Если указан chatId, открываем чат
        if (options.initialChatId) {
            const chat = chatCore.chats.value.find((c) => c.id === options.initialChatId)
            if (chat) {
                await chatCore.openChat(chat)
            }
        }
    }

    // === Enhanced actions ===
    const openChatFromList = async (chat: IChat): Promise<void> => {
        await chatCore.openChat(chat)
        mobileView.showChatView()
        autoScroll.scrollToBottom()
    }

    const sendMessage = async (content: string): Promise<void> => {
        await chatCore.sendMessage(content)
        autoScroll.checkAndAutoScroll()
    }

    const createNewDialog = async (userId: string): Promise<void> => {
        await chatCore.createDialog(userId)
        mobileView.showChatView()
    }

    // === Lifecycle ===
    onMounted(async () => {
        await initialize()
    })

    onUnmounted(() => {
        // Cleanup if needed
    })

    return {
        // Core state from useChatCore
        ...chatCore,

        // UI state
        ...mobileView,
        ...autoScroll,

        // Computed
        currentUser,
        groupedMessages: messageGroups.groupedMessages,

        // Enhanced actions
        openChatFromList,
        sendMessage: sendMessage, // Override with enhanced version
        createNewDialog,
        initialize,
    }
}

export type ChatInterfaceComposable = ReturnType<typeof useChatInterface>
