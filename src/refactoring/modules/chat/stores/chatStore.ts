/*
 * Координирующий стор чатов (главный стор модуля)
 *
 * Основные функции:
 * - Управление списком чатов и текущим чатом
 * - Координация работы между специализированными сторами
 * - Инициализация и lifecycle управление
 * - Базовые CRUD операции через API сервисы
 * - Счетчики непрочитанных сообщений
 * - Восстановление состояния из localStorage
 */

import { defineStore } from 'pinia'
import type {
    IChat,
    IMessage,
    IReactionType,
    IChatInvitation,
    ISearchResults,
    IChatUpdatePayload,
} from '@/refactoring/modules/chat/types/IChat'
import type {
    CreateChatPayload,
    SendMessagePayload,
    UpdateMessagePayload,
    AddReactionPayload,
} from '@/refactoring/modules/chat/types/api'
import { chatApiService } from '@/refactoring/modules/chat/services/chatApi'
import { messageApiService } from '@/refactoring/modules/chat/services/messageApi'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'

export const useChatStore = defineStore('chatStore', {
    state: () => ({
        chats: [] as IChat[],
        currentChat: null as IChat | null,
        messages: [] as IMessage[],
        reactionTypes: [] as IReactionType[],
        invitations: [] as IChatInvitation[],
        searchResults: null as ISearchResults | null,
        isLoadingChats: false,
        isLoadingMessages: false,
        isSending: false,
        isSearching: false,
        isInitialized: false,
        isInitializing: false,
    }),

    getters: {
        // Getter for unread count across all chats
        totalUnreadCount(): number {
            return this.chats.reduce((total, chat) => total + (chat.unread_count || 0), 0)
        },

        // Getter for chats by type
        chatsByType: (state) => (type: string) => {
            return state.chats.filter((chat) => chat.type === type)
        },

        // Getter for unread chats
        unreadChats(): IChat[] {
            return this.chats.filter((chat) => (chat.unread_count || 0) > 0)
        },

        // Getter for active chats (with recent activity)
        activeChats(): IChat[] {
            return this.chats.filter((chat) => chat.last_message)
        },
    },

    actions: {
        async initializeOnce(): Promise<void> {
            if (this.isInitialized || this.isInitializing) {
                return
            }

            this.isInitializing = true

            try {
                await this.fetchChats()
                this.isInitialized = true
            } catch (error) {
                console.error('Ошибка инициализации чат стора:', error)
            } finally {
                this.isInitializing = false
            }
        },

        async fetchChats(): Promise<void> {
            const fb = useFeedbackStore()
            this.isLoadingChats = true

            try {
                const result = await chatApiService.fetchChats()

                if (result.success && result.data) {
                    this.chats = result.data
                } else {
                    this.chats = []
                    if (result.error) {
                        fb.showToast({
                            type: 'error',
                            title: 'Ошибка',
                            message: result.error,
                            time: 7000,
                        })
                    }
                }
            } catch (error) {
                this.chats = []
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось загрузить чаты',
                    time: 7000,
                })
            } finally {
                this.isLoadingChats = false
            }
        },

        async createDialog(userId: string): Promise<IChat> {
            try {
                const result = await chatApiService.createDialog({ user_id: userId })

                if (result.success && result.data) {
                    const chat = result.data
                    this.chats.unshift(chat)
                    return chat
                } else {
                    throw new Error(result.error || 'API error')
                }
            } catch (error) {
                throw error
            }
        },

        // === Chat Management Methods ===
        async fetchChat(chatId: string | number): Promise<IChat | null> {
            try {
                const result = await chatApiService.fetchChat(Number(chatId))
                if (result.success && result.data) {
                    // Update chat in the list if it exists
                    const chatIndex = this.chats.findIndex((chat) => chat.id === result.data!.id)
                    if (chatIndex !== -1) {
                        this.chats[chatIndex] = result.data
                    }
                    return result.data
                }
                return null
            } catch (error) {
                console.error('Error fetching chat:', error)
                return null
            }
        },

        async openChat(chat: IChat): Promise<void> {
            try {
                this.isLoadingMessages = true
                this.messages = []

                // 1. Получаем актуальную информацию о чате
                const updatedChat = await this.fetchChat(chat.id)
                if (updatedChat) {
                    // Обновляем чат в списке чатов
                    const chatIndex = this.chats.findIndex((c) => c.id === chat.id)
                    if (chatIndex !== -1) {
                        this.chats[chatIndex] = updatedChat
                    }
                    this.currentChat = updatedChat
                } else {
                    // Если не удалось получить информацию о чате, используем переданный
                    this.currentChat = chat
                }

                // 2. Загружаем сообщения чата
                const result = await messageApiService.fetchMessages(chat.id)
                if (result.success && result.data) {
                    this.messages = result.data
                }

                // 3. Отмечаем чат как прочитанный
                await this.markChatAsRead(chat.id)

                // 4. Сохраняем ID чата в localStorage
                try {
                    localStorage.setItem('selectedChatId', String(chat.id))
                } catch (e) {
                    // Игнорируем ошибки localStorage в приватном режиме
                }
            } catch (error) {
                console.error('Error opening chat:', error)
            } finally {
                this.isLoadingMessages = false
            }
        },

        async openChatById(chatId: string | number): Promise<void> {
            const chat =
                this.chats.find((c) => c.id === Number(chatId)) || (await this.fetchChat(chatId))
            if (chat) {
                await this.openChat(chat)
            }
        },

        async createChat(payload: CreateChatPayload & { type: string }): Promise<IChat> {
            try {
                // The chatApiService might not have a createChat method, so let's use createGroup or createChannel
                let result
                if (payload.type === 'group') {
                    result = (await chatApiService.createGroup)
                        ? await chatApiService.createGroup(payload)
                        : null
                } else if (payload.type === 'channel') {
                    result = (await chatApiService.createChannel)
                        ? await chatApiService.createChannel(payload)
                        : null
                } else {
                    throw new Error('Unsupported chat type')
                }

                if (result?.success && result.data) {
                    const chat = result.data
                    this.chats.unshift(chat)
                    return chat
                } else {
                    throw new Error(result?.error || 'Failed to create chat')
                }
            } catch (error) {
                throw error
            }
        },

        async createGroup(payload: CreateChatPayload): Promise<IChat> {
            return this.createChat({ ...payload, type: 'group' })
        },

        async createChannel(payload: CreateChatPayload): Promise<IChat> {
            return this.createChat({ ...payload, type: 'channel' })
        },

        async updateChat(chatId: string | number, payload: IChatUpdatePayload): Promise<IChat> {
            try {
                const result = await chatApiService.updateChat(Number(chatId), {
                    title: payload.title,
                    description: payload.description,
                    icon: payload.icon instanceof File ? payload.icon : null,
                })
                if (result.success && result.data) {
                    // Update chat in the list
                    const chatIndex = this.chats.findIndex((chat) => chat.id === Number(chatId))
                    if (chatIndex !== -1) {
                        this.chats[chatIndex] = result.data
                    }
                    // Update current chat if it's the same
                    if (this.currentChat?.id === Number(chatId)) {
                        this.currentChat = result.data
                    }
                    return result.data
                } else {
                    throw new Error(result.error || 'Failed to update chat')
                }
            } catch (error) {
                throw error
            }
        },

        async deleteChat(chatId: string | number): Promise<void> {
            try {
                const result = await chatApiService.deleteChat(Number(chatId))
                if (result.success) {
                    // Remove from chats list
                    this.chats = this.chats.filter((chat) => chat.id !== Number(chatId))
                    // Clear current chat if it was deleted
                    if (this.currentChat?.id === Number(chatId)) {
                        this.currentChat = null
                        this.messages = []
                    }
                } else {
                    throw new Error(result.error || 'Failed to delete chat')
                }
            } catch (error) {
                throw error
            }
        },

        // === Message Management Methods ===
        async sendMessage(content: string): Promise<void> {
            if (!this.currentChat) return

            this.isSending = true
            try {
                const result = await messageApiService.sendMessage(this.currentChat.id, content)
                if (result.success && result.data) {
                    this.messages.push(result.data)
                    // Update last message in chat
                    const chatIndex = this.chats.findIndex(
                        (chat) => chat.id === this.currentChat!.id,
                    )
                    if (chatIndex !== -1) {
                        this.chats[chatIndex].last_message = result.data
                    }
                }
            } catch (error) {
                console.error('Error sending message:', error)
                throw error
            } finally {
                this.isSending = false
            }
        },

        async sendMessageWithFiles(content: string, files: File[]): Promise<void> {
            if (!this.currentChat) return

            this.isSending = true
            try {
                // For files, we might need a different method or parameter structure
                const result = await messageApiService.sendMessage(this.currentChat.id, content)
                if (result.success && result.data) {
                    this.messages.push(result.data)
                    // Update last message in chat
                    const chatIndex = this.chats.findIndex(
                        (chat) => chat.id === this.currentChat!.id,
                    )
                    if (chatIndex !== -1) {
                        this.chats[chatIndex].last_message = result.data
                    }
                }
            } catch (error) {
                console.error('Error sending message with files:', error)
                throw error
            } finally {
                this.isSending = false
            }
        },

        async updateMessage(
            chatId: string | number,
            messageId: number,
            content: string,
        ): Promise<void> {
            try {
                const result = await messageApiService.updateMessage(Number(chatId), messageId, {
                    content,
                })
                if (result.success && result.data) {
                    // Update message in local state
                    const messageIndex = this.messages.findIndex((msg) => msg.id === messageId)
                    if (messageIndex !== -1) {
                        this.messages[messageIndex] = result.data
                    }
                }
            } catch (error) {
                console.error('Error updating message:', error)
                throw error
            }
        },

        async deleteMessage(chatId: string | number, messageId: number): Promise<void> {
            try {
                const result = await messageApiService.deleteMessage(Number(chatId), messageId)
                if (result.success) {
                    // Remove message from local state
                    this.messages = this.messages.filter((msg) => msg.id !== messageId)
                }
            } catch (error) {
                console.error('Error deleting message:', error)
                throw error
            }
        },

        // === Search Methods ===
        async searchChats(query: string): Promise<void> {
            this.isSearching = true
            try {
                const result = await chatApiService.searchChats({ q: query })
                if (result.success && result.data) {
                    this.searchResults = result.data
                } else {
                    this.searchResults = null
                }
            } catch (error) {
                console.error('Error searching chats:', error)
                this.searchResults = null
            } finally {
                this.isSearching = false
            }
        },

        // === Member Management Methods ===
        async addMembersToChat(chatId: string | number, userIds: string[]): Promise<void> {
            try {
                const result = await chatApiService.addMembersToChat(Number(chatId), {
                    user_ids: userIds,
                })
                if (result.success) {
                    // Refresh the chat data
                    await this.fetchChat(chatId)
                }
            } catch (error) {
                console.error('Error adding members to chat:', error)
                throw error
            }
        },

        async removeMemberFromChat(chatId: string | number, userId: string): Promise<void> {
            try {
                const result = await chatApiService.removeMemberFromChat(Number(chatId), userId)
                if (result.success) {
                    // Refresh the chat data
                    await this.fetchChat(chatId)
                }
            } catch (error) {
                console.error('Error removing member from chat:', error)
                throw error
            }
        },

        // === Reaction Methods ===
        // Note: Reactions are handled by messagesStore
        async addReaction(messageId: number, reactionId: number): Promise<void> {
            console.warn('Use messagesStore.addReaction instead')
        },

        async clearMyReactions(messageId: number): Promise<void> {
            console.warn('Use messagesStore.removeReaction instead')
        },

        async setExclusiveReaction(messageId: number, reactionId: number): Promise<void> {
            console.warn('Use messagesStore.setExclusiveReaction instead')
        },

        // === Invitation Methods ===
        // Note: Invitations are handled by membersStore
        async fetchInvitations(): Promise<void> {
            console.warn('Use membersStore.fetchInvitations instead')
        },

        async acceptInvitation(invitationId: string | number): Promise<void> {
            console.warn('Use membersStore.acceptInvitation instead')
        },

        async declineInvitation(invitationId: string | number): Promise<void> {
            console.warn('Use membersStore.declineInvitation instead')
        },

        async removeInvitation(invitationId: string | number): Promise<void> {
            console.warn('Use membersStore.removeInvitation instead')
        },

        // === Direct Chat Methods ===
        async findOrCreateDirectChat(userId: string): Promise<IChat> {
            // First try to find existing direct chat
            const existingChat = this.chats.find(
                (chat) =>
                    chat.type === 'dialog' &&
                    chat.members?.some((member) => member.user.id === userId),
            )

            if (existingChat) {
                return existingChat
            }

            // Create new direct chat
            return this.createDialog(userId)
        },

        async createDirectChat(employeeId: string): Promise<IChat> {
            return this.createDialog(employeeId)
        },

        // === Utility Methods ===
        async markChatAsRead(chatId: string | number, lastMessageId?: number): Promise<void> {
            // Update unread count locally for now
            const chatIndex = this.chats.findIndex((chat) => chat.id === Number(chatId))
            if (chatIndex !== -1) {
                this.chats[chatIndex].unread_count = 0
            }
        },

        // === WebSocket Methods ===
        // Note: WebSocket is handled by realtimeStore
        checkWebSocketConnection(): boolean {
            console.warn('Use realtimeStore.checkConnectionHealth instead')
            return true
        },

        async reconnectToWebSocket(): Promise<void> {
            console.warn('Use realtimeStore.forceReconnect instead')
        },

        // === Lifecycle Methods ===
        resetInitialization(): void {
            this.isInitialized = false
            this.isInitializing = false
        },

        // === Real-time Event Handlers ===
        handleNewMessage(message: IMessage, chatId: string | number): void {
            // Add message to current chat if it matches
            if (this.currentChat?.id === Number(chatId)) {
                this.messages.push(message)
            }

            // Update last message in chat list
            const chatIndex = this.chats.findIndex((chat) => chat.id === Number(chatId))
            if (chatIndex !== -1) {
                this.chats[chatIndex].last_message = message
                // Increment unread count if not current chat
                if (this.currentChat?.id !== Number(chatId)) {
                    this.chats[chatIndex].unread_count =
                        (this.chats[chatIndex].unread_count || 0) + 1
                }
            }
        },

        handleChatUpdated(chat: IChat): void {
            const chatIndex = this.chats.findIndex((c) => c.id === chat.id)
            if (chatIndex !== -1) {
                this.chats[chatIndex] = chat
            }
            if (this.currentChat?.id === chat.id) {
                this.currentChat = chat
            }
        },

        handleMembershipUpdate(data: any): void {
            // Refresh chats when membership changes
            this.fetchChats()
        },
    },
})
