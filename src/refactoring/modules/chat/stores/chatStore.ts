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
import type { IChat, IMessage, IChatUpdatePayload } from '@/refactoring/modules/chat/types/IChat'
import { chatApiService } from '@/refactoring/modules/chat/services/chatApi'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'

export const useChatStore = defineStore('chatStore', {
    state: () => ({
        chats: [] as IChat[],
        currentChat: null as IChat | null,
        isLoadingChats: false,
        isInitialized: false,
        isInitializing: false,
    }),

    getters: {
        /**
         * Общее количество непрочитанных сообщений
         */
        totalUnreadCount: (state) => {
            return state.chats.reduce((total, chat) => total + (chat.unread_count || 0), 0)
        },

        /**
         * Чаты по типу
         */
        chatsByType: (state) => (type: string) => {
            return state.chats.filter(chat => chat.type === type)
        },

        /**
         * Непрочитанные чаты
         */
        unreadChats: (state) => {
            return state.chats.filter(chat => (chat.unread_count || 0) > 0)
        },

        /**
         * Активные чаты (с последними сообщениями)
         */
        activeChats: (state) => {
            return state.chats.filter(chat => chat.last_message_id)
        },

        /**
         * Проверяет, есть ли текущий чат
         */
        hasCurrentChat: (state) => {
            return !!state.currentChat
        },

        // ============ ГЕТТЕРЫ ДЛЯ ИНТЕГРАЦИИ С ДРУГИМИ СТОРАМИ ============

        /**
         * Сообщения текущего чата
         */
        messages: () => {
            const { useMessagesStore } = require('./messagesStore')
            const messagesStore = useMessagesStore()
            return messagesStore.sortedMessages
        },

        /**
         * Состояние загрузки сообщений
         */
        isLoadingMessages: () => {
            const { useMessagesStore } = require('./messagesStore')
            const messagesStore = useMessagesStore()
            return messagesStore.isLoadingMessages
        },

        /**
         * Состояние отправки сообщения
         */
        isSending: () => {
            const { useMessagesStore } = require('./messagesStore')
            const messagesStore = useMessagesStore()
            return messagesStore.isSending
        },

        /**
         * Типы реакций
         */
        reactionTypes: () => {
            const { useMessagesStore } = require('./messagesStore')
            const messagesStore = useMessagesStore()
            return messagesStore.reactionTypes
        },

        /**
         * Приглашения в чаты
         */
        invitations: () => {
            const { useMembersStore } = require('./membersStore')
            const membersStore = useMembersStore()
            return membersStore.invitations
        },

        /**
         * Состояние загрузки приглашений
         */
        isLoadingInvitations: () => {
            const { useMembersStore } = require('./membersStore')
            const membersStore = useMembersStore()
            return membersStore.isLoadingInvitations
        },

        /**
         * Результаты поиска
         */
        searchResults: () => {
            const { useSearchStore } = require('./searchStore')
            const searchStore = useSearchStore()
            return searchStore.searchResults
        },

        /**
         * Состояние поиска
         */
        isSearching: () => {
            const { useSearchStore } = require('./searchStore')
            const searchStore = useSearchStore()
            return searchStore.isSearching
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

        /**
         * Создает групповой чат
         */
        async createGroup(payload: {
            title: string
            description?: string
            icon?: File | null
        }): Promise<IChat> {
            try {
                const result = await chatApiService.createGroup(payload)

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

        /**
         * Создает канал
         */
        async createChannel(payload: {
            title: string
            description?: string
            icon?: File | null
        }): Promise<IChat> {
            try {
                const result = await chatApiService.createChannel(payload)

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

        /**
         * Получает информацию о конкретном чате
         */
        async fetchChat(chatId: number): Promise<IChat> {
            try {
                const result = await chatApiService.fetchChat(chatId)

                if (result.success && result.data) {
                    return result.data
                } else {
                    throw new Error(result.error || 'API error')
                }
            } catch (error) {
                throw error
            }
        },

        /**
         * Открывает чат с полной загрузкой данных
         */
        async openChat(chatOrId: IChat | number): Promise<void> {
            let chat: IChat

            if (typeof chatOrId === 'number') {
                chat = await this.fetchChat(chatOrId)
            } else {
                chat = chatOrId
            }

            // Устанавливаем текущий чат
            this.currentChat = chat

            // Обновляем чат в списке если он там есть
            const chatIndex = this.chats.findIndex(c => c.id === chat.id)
            if (chatIndex !== -1) {
                this.chats.splice(chatIndex, 1, chat)
            } else {
                // Если чата нет в списке, добавляем его
                this.chats.unshift(chat)
            }

            // Интеграция с другими сторами
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            // Загружаем сообщения для нового чата
            await messagesStore.fetchMessages(chat.id)
            
            // Загружаем типы реакций если еще не загружены
            await messagesStore.fetchReactionTypes()

            // Отмечаем чат как прочитанный если есть сообщения
            const lastMessage = messagesStore.lastMessage
            if (lastMessage) {
                await this.markChatAsRead(chat.id, lastMessage.id)
            } else {
                await this.markChatAsRead(chat.id)
            }

            // Сохраняем ID в localStorage
            try {
                localStorage.setItem('selectedChatId', String(chat.id))
            } catch (e) {
                // Игнорируем ошибки localStorage
            }
        },

        /**
         * Открывает чат по ID (для восстановления состояния)
         */
        async openChatById(chatId: number): Promise<void> {
            const chat = await this.fetchChat(chatId)
            await this.openChat(chat)
        },

        /**
         * Обновляет информацию о чате
         */
        async updateChat(chatId: number, payload: IChatUpdatePayload): Promise<IChat> {
            try {
                const result = await chatApiService.updateChat(chatId, payload)

                if (result.success && result.data) {
                    const updatedChat = result.data

                    // Обновляем в списке чатов
                    const chatIndex = this.chats.findIndex(c => c.id === chatId)
                    if (chatIndex !== -1) {
                        this.chats.splice(chatIndex, 1, updatedChat)
                    }

                    // Обновляем текущий чат если это он
                    if (this.currentChat?.id === chatId) {
                        this.currentChat = updatedChat
                    }

                    return updatedChat
                } else {
                    throw new Error(result.error || 'API error')
                }
            } catch (error) {
                throw error
            }
        },

        /**
         * Удаляет чат
         */
        async deleteChat(chatId: number): Promise<void> {
            try {
                const result = await chatApiService.deleteChat(chatId)

                if (result.success) {
                    // Удаляем из списка чатов
                    this.chats = this.chats.filter(c => c.id !== chatId)

                    // Если удаленный чат был текущим, сбрасываем
                    if (this.currentChat?.id === chatId) {
                        this.currentChat = null
                        localStorage.removeItem('selectedChatId')
                    }
                } else {
                    throw new Error(result.error || 'API error')
                }
            } catch (error) {
                throw error
            }
        },

        /**
         * Добавляет участников в чат
         */
        async addMembersToChat(chatId: number, userIds: string[]): Promise<boolean> {
            try {
                const result = await chatApiService.addMembersToChat(chatId, { user_ids: userIds })

                if (result.success) {
                    // Обновляем информацию о чате
                    const updatedChat = await this.fetchChat(chatId)
                    
                    const chatIndex = this.chats.findIndex(c => c.id === chatId)
                    if (chatIndex !== -1) {
                        this.chats.splice(chatIndex, 1, updatedChat)
                    }

                    if (this.currentChat?.id === chatId) {
                        this.currentChat = updatedChat
                    }

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось добавить участников',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось добавить участников',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Удаляет участника из чата
         */
        async removeMemberFromChat(chatId: number, userId: string): Promise<boolean> {
            try {
                const result = await chatApiService.removeMemberFromChat(chatId, userId)

                if (result.success) {
                    // Обновляем информацию о чате
                    const updatedChat = await this.fetchChat(chatId)
                    
                    const chatIndex = this.chats.findIndex(c => c.id === chatId)
                    if (chatIndex !== -1) {
                        this.chats.splice(chatIndex, 1, updatedChat)
                    }

                    if (this.currentChat?.id === chatId) {
                        this.currentChat = updatedChat
                    }

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось удалить участника',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось удалить участника',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Отмечает чат как прочитанный
         */
        async markChatAsRead(chatId: number, lastMessageId?: number): Promise<void> {
            // Обновляем локально
            const chatIndex = this.chats.findIndex(c => c.id === chatId)
            if (chatIndex !== -1) {
                const updatedChat = {
                    ...this.chats[chatIndex],
                    unread_count: 0,
                    last_read_message_id: lastMessageId || this.chats[chatIndex].last_message_id,
                }
                this.chats.splice(chatIndex, 1, updatedChat)
            }

            if (this.currentChat?.id === chatId) {
                this.currentChat = {
                    ...this.currentChat,
                    unread_count: 0,
                    last_read_message_id: lastMessageId || this.currentChat.last_read_message_id,
                }
            }
        },

        /**
         * Находит или создает диалог с пользователем
         */
        async findOrCreateDirectChat(userId: string): Promise<IChat> {
            // Сначала ищем существующий диалог
            const existingChat = this.chats.find(chat => 
                (chat.type === 'direct' || chat.type === 'dialog') &&
                chat.members?.some(member => member.user?.id === userId)
            )

            if (existingChat) {
                return existingChat
            }

            // Если не найден, создаем новый
            return await this.createDialog(userId)
        },

        /**
         * Создает прямой чат (алиас для createDialog для совместимости)
         */
        async createDirectChat(employeeId: string): Promise<IChat> {
            return await this.createDialog(employeeId)
        },

        // ============ МЕТОДЫ РАБОТЫ С СООБЩЕНИЯМИ ============

        /**
         * Отправляет текстовое сообщение
         */
        async sendMessage(content: string): Promise<IMessage | null> {
            if (!this.currentChat) return null

            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            const message = await messagesStore.sendMessage(this.currentChat.id, content)
            
            if (message) {
                // Обновляем информацию о последнем сообщении в чате
                const chatIndex = this.chats.findIndex(c => c.id === this.currentChat!.id)
                if (chatIndex !== -1) {
                    const updatedChat = {
                        ...this.chats[chatIndex],
                        last_message: message,
                        last_message_id: message.id,
                    }
                    this.chats.splice(chatIndex, 1, updatedChat)
                    
                    // Перемещаем чат в начало списка
                    this.chats = this.sortChatsByLastMessage(this.chats)
                }

                if (this.currentChat) {
                    this.currentChat.last_message = message
                    this.currentChat.last_message_id = message.id
                }
            }
            
            return message
        },

        /**
         * Отправляет сообщение с файлами
         */
        async sendMessageWithFiles(content: string, files: File[]): Promise<IMessage | null> {
            if (!this.currentChat) return null

            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            const message = await messagesStore.sendMessageWithFiles(this.currentChat.id, content, files)
            
            if (message) {
                // Обновляем информацию о последнем сообщении в чате
                const chatIndex = this.chats.findIndex(c => c.id === this.currentChat!.id)
                if (chatIndex !== -1) {
                    const updatedChat = {
                        ...this.chats[chatIndex],
                        last_message: message,
                        last_message_id: message.id,
                    }
                    this.chats.splice(chatIndex, 1, updatedChat)
                    
                    // Перемещаем чат в начало списка
                    this.chats = this.sortChatsByLastMessage(this.chats)
                }

                if (this.currentChat) {
                    this.currentChat.last_message = message
                    this.currentChat.last_message_id = message.id
                }
            }
            
            return message
        },

        /**
         * Обновляет сообщение
         */
        async updateMessage(chatId: number, messageId: number, content: string): Promise<IMessage | null> {
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            return await messagesStore.updateMessage(chatId, messageId, content)
        },

        /**
         * Удаляет сообщение
         */
        async deleteMessage(chatId: number, messageId: number): Promise<void> {
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            await messagesStore.deleteMessage(chatId, messageId)
        },

        // ============ МЕТОДЫ РАБОТЫ С РЕАКЦИЯМИ ============

        /**
         * Добавляет реакцию на сообщение
         */
        async addReaction(messageId: number, reactionTypeId: number): Promise<void> {
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            await messagesStore.addReaction(messageId, reactionTypeId)
        },

        /**
         * Удаляет реакцию с сообщения
         */
        async removeReaction(messageId: number): Promise<void> {
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            await messagesStore.removeReaction(messageId)
        },

        /**
         * Устанавливает эксклюзивную реакцию
         */
        async setExclusiveReaction(messageId: number, reactionTypeId: number): Promise<void> {
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            await messagesStore.setExclusiveReaction(messageId, reactionTypeId)
        },

        /**
         * Очищает все реакции пользователя на сообщение
         */
        async clearMyReactions(messageId: number): Promise<void> {
            const { useMessagesStore } = await import('./messagesStore')
            const messagesStore = useMessagesStore()
            
            await messagesStore.removeReaction(messageId)
        },

        // ============ МЕТОДЫ ПОИСКА ============

        /**
         * Выполняет поиск чатов
         */
        async searchChats(query: string, includePublic: boolean = true): Promise<void> {
            const { useSearchStore } = await import('./searchStore')
            const searchStore = useSearchStore()
            
            await searchStore.searchChats(query, includePublic)
        },

        // ============ МЕТОДЫ РАБОТЫ С ПРИГЛАШЕНИЯМИ ============

        /**
         * Загружает приглашения
         */
        async fetchInvitations(): Promise<void> {
            const { useMembersStore } = await import('./membersStore')
            const membersStore = useMembersStore()
            
            await membersStore.fetchInvitations()
        },

        /**
         * Принимает приглашение
         */
        async acceptInvitation(invitationId: number): Promise<boolean> {
            const { useMembersStore } = await import('./membersStore')
            const membersStore = useMembersStore()
            
            const success = await membersStore.acceptInvitation(invitationId)
            if (success) {
                // Обновляем список чатов после принятия приглашения
                await this.fetchChats()
            }
            return success
        },

        /**
         * Отклоняет приглашение
         */
        async declineInvitation(invitationId: number): Promise<boolean> {
            const { useMembersStore } = await import('./membersStore')
            const membersStore = useMembersStore()
            
            return await membersStore.declineInvitation(invitationId)
        },

        // ============ МЕТОДЫ РАБОТЫ С REALTIME ============

        /**
         * Проверяет состояние WebSocket соединения
         */
        async checkWebSocketConnection(): Promise<{ connected: boolean; connecting: boolean; subscriptions: string[]; subscribedToUserChannel: boolean }> {
            const { useRealtimeStore } = await import('./realtimeStore')
            const realtimeStore = useRealtimeStore()
            
            return {
                connected: realtimeStore.isConnected,
                connecting: realtimeStore.isConnecting,
                subscriptions: [], // Заглушка, заполнится из realtimeStore
                subscribedToUserChannel: true, // Заглушка
            }
        },

        /**
         * Переподключается к WebSocket
         */
        async reconnectToWebSocket(): Promise<void> {
            const { useRealtimeStore } = await import('./realtimeStore')
            const realtimeStore = useRealtimeStore()
            
            await realtimeStore.forceReconnect()
        },

        // ============ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ============

        /**
         * Сортирует чаты по времени последнего сообщения
         */
        sortChatsByLastMessage(chats: IChat[]): IChat[] {
            return [...chats].sort((a, b) => {
                const aLastMessage = a.last_message
                const bLastMessage = b.last_message

                if (aLastMessage && bLastMessage) {
                    const aTime = Date.parse(aLastMessage.created_at)
                    const bTime = Date.parse(bLastMessage.created_at)
                    if (!isNaN(aTime) && !isNaN(bTime)) {
                        return bTime - aTime // Новые сверху
                    }
                }

                // Если у одного есть последнее сообщение, а у другого нет
                if (aLastMessage && !bLastMessage) return -1
                if (!aLastMessage && bLastMessage) return 1

                // Если у обоих нет последних сообщений, сортируем по времени создания чата
                const aCreated = a.created_at ? Date.parse(a.created_at) : 0
                const bCreated = b.created_at ? Date.parse(b.created_at) : 0

                return bCreated - aCreated // Новые сверху
            })
        },

        /**
         * Сбрасывает состояние инициализации
         */
        resetInitialization(): void {
            this.isInitialized = false
            this.isInitializing = false
            this.currentChat = null
            this.chats = []
            this.isLoadingChats = false
        },
    },
})