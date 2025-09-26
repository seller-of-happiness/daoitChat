/**
 * Упрощенный композибл для основных операций чата
 * Следует принципам KISS, DRY, YAGNI
 */

import { computed } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useMessagesStore } from '../stores/messagesStore'
import { useMembersStore } from '../stores/membersStore'
import { useRealtimeStore } from '../stores/realtimeStore'
import type { IChat } from '../types/IChat'

export function useSimpleChat() {
    const chatStore = useChatStore()
    const messagesStore = useMessagesStore()
    const membersStore = useMembersStore()
    const realtimeStore = useRealtimeStore()

    // === Reactive state ===
    const chats = computed(() => chatStore.chats)
    const currentChat = computed(() => chatStore.currentChat)
    const messages = computed(() => messagesStore.sortedMessages)
    const isLoading = computed(() => chatStore.isLoadingChats || messagesStore.isLoadingMessages)
    const isConnected = computed(() => realtimeStore.isConnected)

    // === Core operations ===
    const initialize = async (): Promise<void> => {
        await Promise.all([chatStore.initializeOnce(), realtimeStore.initialize()])
    }

    const openChat = async (chat: IChat): Promise<void> => {
        await chatStore.openChat(chat)
    }

    const sendMessage = async (content: string): Promise<void> => {
        if (!currentChat.value || !content.trim()) return
        await messagesStore.sendMessage(currentChat.value.id, content.trim())
    }

    const createDialog = async (userId: string): Promise<IChat> => {
        const chat = await chatStore.createDialog(userId)
        await openChat(chat)
        return chat
    }

    // === Search ===
    const searchChats = (query: string) => {
        if (!query.trim()) return []
        const lowercaseQuery = query.toLowerCase()
        return chats.value.filter((chat) => chat.title.toLowerCase().includes(lowercaseQuery))
    }

    return {
        // State
        chats,
        currentChat,
        messages,
        isLoading,
        isConnected,

        // Actions
        initialize,
        openChat,
        sendMessage,
        createDialog,
        searchChats,
    }
}

export type SimpleChatComposable = ReturnType<typeof useSimpleChat>
