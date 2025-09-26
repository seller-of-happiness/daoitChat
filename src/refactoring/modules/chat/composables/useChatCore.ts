/**
 * Основной композибл чат-модуля (упрощенная версия)
 * Принципы: KISS, DRY, YAGNI
 */

import { computed } from 'vue'
import { useChatStore } from '../stores/chatStore'
import { useMessagesStore } from '../stores/messagesStore'
import { useMembersStore } from '../stores/membersStore'
import { useSearchStore } from '../stores/searchStore'
import { useRealtimeStore } from '../stores/realtimeStore'

import type { IChat, IMessage } from '../types/IChat'

export function useChatCore() {
    // === Stores ===
    const chatStore = useChatStore()
    const messagesStore = useMessagesStore()
    const membersStore = useMembersStore()
    const searchStore = useSearchStore()
    const realtimeStore = useRealtimeStore()

    // === Core State ===
    const chats = computed(() => chatStore.chats)
    const currentChat = computed(() => chatStore.currentChat)
    const messages = computed(() => messagesStore.sortedMessages)
    const isLoading = computed(() => chatStore.isLoadingChats || messagesStore.isLoadingMessages)

    // === Core Actions ===
    const initialize = async (): Promise<void> => {
        await chatStore.initializeOnce()
        await realtimeStore.initialize()
    }

    const openChat = async (chat: IChat): Promise<void> => {
        await chatStore.openChat(chat)
    }

    const sendMessage = async (content: string): Promise<IMessage | null> => {
        if (!currentChat.value || !content.trim()) return null
        return await messagesStore.sendMessage(currentChat.value.id, content.trim())
    }

    const createDialog = async (userId: string): Promise<IChat> => {
        const chat = await chatStore.createDialog(userId)
        await openChat(chat)
        return chat
    }

    // === Search ===
    const searchChats = async (query: string): Promise<void> => {
        await searchStore.searchChats(query)
    }

    const clearSearch = (): void => {
        searchStore.clearSearch()
    }

    // === Invitations ===
    const acceptInvitation = async (invitationId: number): Promise<boolean> => {
        const success = await membersStore.acceptInvitation(invitationId)
        if (success) {
            await chatStore.fetchChats()
        }
        return success
    }

    const declineInvitation = async (invitationId: number): Promise<boolean> => {
        return await membersStore.declineInvitation(invitationId)
    }

    // === Computed Properties ===
    const searchResults = computed(() => searchStore.searchResults)
    const invitations = computed(() => membersStore.invitations)
    const totalUnreadCount = computed(() => chatStore.totalUnreadCount)
    const isSearching = computed(() => searchStore.isSearching)
    const isConnected = computed(() => realtimeStore.isConnected)

    return {
        // Core state
        chats,
        currentChat,
        messages,
        searchResults,
        invitations,

        // Flags
        isLoading,
        isSearching,
        isConnected,

        // Computed
        totalUnreadCount,

        // Core actions
        initialize,
        openChat,
        sendMessage,
        createDialog,
        searchChats,
        clearSearch,
        acceptInvitation,
        declineInvitation,
    }
}

export type ChatCoreComposable = ReturnType<typeof useChatCore>
