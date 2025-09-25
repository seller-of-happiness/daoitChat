/*
 * Стор для управления сообщениями и реакциями
 * 
 * Отвечает за:
 * - Состояние сообщений текущего чата
 * - Отправку и редактирование сообщений
 * - Управление реакциями
 * - Оптимистичные обновления
 * - Сортировку и группировку сообщений
 */

import { defineStore } from 'pinia'
import type { IMessage, IReactionType } from '@/refactoring/modules/chat/types/IChat'
import { messageApiService } from '@/refactoring/modules/chat/services/messageApi'
import { reactionApiService } from '@/refactoring/modules/chat/services/reactionApi'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'

// Упорядочивание сообщений по времени (сначала старые)
function compareMessagesAscending(a: IMessage, b: IMessage): number {
    const aTime = a?.created_at ? Date.parse(a.created_at) : NaN
    const bTime = b?.created_at ? Date.parse(b.created_at) : NaN
    if (!Number.isNaN(aTime) && !Number.isNaN(bTime)) return aTime - bTime
    // Фоллбек по id на случай отсутствия/некорректного времени
    const aId = a?.id ?? 0
    const bId = b?.id ?? 0
    return aId - bId
}

interface MessagesStoreState {
    messages: IMessage[]
    reactionTypes: IReactionType[]
    isLoadingMessages: boolean
    isSending: boolean
    currentChatId: number | null
}

export const useMessagesStore = defineStore('messagesStore', {
    state: (): MessagesStoreState => ({
        messages: [],
        reactionTypes: [],
        isLoadingMessages: false,
        isSending: false,
        currentChatId: null,
    }),

    getters: {
        /**
         * Сообщения, отсортированные по времени (старые → новые)
         */
        sortedMessages: (state) => {
            return [...state.messages].sort(compareMessagesAscending)
        },

        /**
         * Группировка сообщений по дням
         */
        groupedMessagesByDate: (state) => {
            const sorted = [...state.messages].sort(compareMessagesAscending)
            const groups: { [date: string]: IMessage[] } = {}

            sorted.forEach(message => {
                if (message.created_at) {
                    const date = new Date(message.created_at).toDateString()
                    if (!groups[date]) {
                        groups[date] = []
                    }
                    groups[date].push(message)
                }
            })

            return groups
        },

        /**
         * Последнее сообщение в чате
         */
        lastMessage: (state) => {
            if (state.messages.length === 0) return null
            const sorted = [...state.messages].sort(compareMessagesAscending)
            return sorted[sorted.length - 1] || null
        },

        /**
         * Количество сообщений в текущем чате
         */
        messagesCount: (state) => state.messages.length,

        /**
         * Проверка, есть ли сообщения
         */
        hasMessages: (state) => state.messages.length > 0,
    },

    actions: {
        /**
         * Устанавливает текущий чат и очищает сообщения
         */
        setCurrentChat(chatId: number | null): void {
            this.currentChatId = chatId
            this.messages = []
        },

        /**
         * Загружает сообщения для указанного чата
         */
        async fetchMessages(chatId: number): Promise<void> {
            this.isLoadingMessages = true
            this.currentChatId = chatId

            try {
                const result = await messageApiService.fetchMessages(chatId)
                
                if (result.success && result.data) {
                    // Сортируем сообщения и заменяем массив
                    const sortedMessages = [...result.data].sort(compareMessagesAscending)
                    this.messages = sortedMessages
                } else {
                    this.messages = []
                    if (result.error) {
                        console.warn('Ошибка загрузки сообщений:', result.error)
                    }
                }
            } catch (error) {
                this.messages = []
                console.error('Критическая ошибка загрузки сообщений:', error)
            } finally {
                this.isLoadingMessages = false
            }
        },

        /**
         * Отправляет текстовое сообщение
         */
        async sendMessage(chatId: number, content: string): Promise<IMessage | null> {
            if (!content.trim()) return null

            this.isSending = true

            try {
                const result = await messageApiService.sendMessage(chatId, content.trim())
                
                if (result.success && result.data) {
                    // Добавляем сообщение оптимистично, если его еще нет
                    this.addMessageOptimistically(result.data)
                    return result.data
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось отправить сообщение',
                        time: 7000,
                    })
                    return null
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отправить сообщение',
                    time: 7000,
                })
                return null
            } finally {
                this.isSending = false
            }
        },

        /**
         * Отправляет сообщение с файлами
         */
        async sendMessageWithFiles(chatId: number, content: string, files: File[]): Promise<IMessage | null> {
            if (!content.trim() && files.length === 0) return null

            this.isSending = true

            try {
                const result = await messageApiService.sendMessageWithFiles(chatId, {
                    content: content.trim(),
                    files,
                })
                
                if (result.success && result.data) {
                    // Добавляем сообщение оптимистично
                    this.addMessageOptimistically(result.data)

                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'success',
                        title: 'Отправлено',
                        message: `Сообщение с ${files.length} файлами отправлено`,
                        time: 3000,
                    })

                    return result.data
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось отправить сообщение с файлами',
                        time: 7000,
                    })
                    return null
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отправить сообщение с файлами',
                    time: 7000,
                })
                return null
            } finally {
                this.isSending = false
            }
        },

        /**
         * Обновляет сообщение
         */
        async updateMessage(chatId: number, messageId: number, content: string): Promise<IMessage | null> {
            try {
                const result = await messageApiService.updateMessage(chatId, messageId, { content })
                
                if (result.success && result.data) {
                    // Обновляем сообщение в локальном списке
                    const messageIndex = this.messages.findIndex(m => m.id === messageId)
                    if (messageIndex !== -1) {
                        this.messages.splice(messageIndex, 1, result.data)
                    }

                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'success',
                        title: 'Обновлено',
                        message: 'Сообщение изменено',
                        time: 3000,
                    })

                    return result.data
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось изменить сообщение',
                        time: 7000,
                    })
                    return null
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось изменить сообщение',
                    time: 7000,
                })
                return null
            }
        },

        /**
         * Удаляет сообщение
         */
        async deleteMessage(chatId: number, messageId: number): Promise<void> {
            try {
                const result = await messageApiService.deleteMessage(chatId, messageId)
                
                if (result.success) {
                    // Удаляем сообщение из локального списка
                    this.messages = this.messages.filter(m => m.id !== messageId)

                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'success',
                        title: 'Удалено',
                        message: 'Сообщение удалено',
                        time: 3000,
                    })
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось удалить сообщение',
                        time: 7000,
                    })
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось удалить сообщение',
                    time: 7000,
                })
            }
        },

        /**
         * Добавляет новое сообщение оптимистично
         */
        addMessageOptimistically(message: IMessage): void {
            // Проверяем что сообщение еще не добавлено
            const exists = this.messages.some(m => m.id === message.id)
            if (!exists) {
                this.messages.push(message)
                this.messages.sort(compareMessagesAscending)
            }
        },

        /**
         * Обрабатывает новое сообщение из WebSocket
         */
        handleNewMessage(message: IMessage, chatId: number): void {
            // Проверяем что это сообщение для текущего чата
            if (this.currentChatId === chatId) {
                this.addMessageOptimistically(message)
            }
        },

        // ============ РЕАКЦИИ ============

        /**
         * Загружает типы реакций
         */
        async fetchReactionTypes(): Promise<void> {
            if (this.reactionTypes.length > 0) return // Кешируем

            try {
                const result = await reactionApiService.fetchReactionTypes()
                
                if (result.success && result.data) {
                    this.reactionTypes = result.data
                }
            } catch (error) {
                console.warn('Ошибка загрузки типов реакций:', error)
            }
        },

        /**
         * Добавляет реакцию на сообщение
         */
        async addReaction(messageId: number, reactionTypeId: number): Promise<void> {
            if (!this.currentChatId) return

            try {
                const result = await reactionApiService.addReaction(
                    this.currentChatId, 
                    messageId, 
                    { reaction_type_id: reactionTypeId }
                )
                
                if (!result.success) {
                    // При ошибке перезагружаем сообщения для корректного состояния
                    await this.fetchMessages(this.currentChatId)
                }
                // Успешные реакции обновятся через WebSocket
            } catch (error) {
                if (this.currentChatId) {
                    await this.fetchMessages(this.currentChatId)
                }
            }
        },

        /**
         * Удаляет реакцию с сообщения
         */
        async removeReaction(messageId: number): Promise<void> {
            if (!this.currentChatId) return

            try {
                const result = await reactionApiService.removeReaction(this.currentChatId, messageId)
                
                if (!result.success) {
                    // При ошибке перезагружаем сообщения для корректного состояния
                    await this.fetchMessages(this.currentChatId)
                }
                // Успешные удаления обновятся через WebSocket
            } catch (error) {
                if (this.currentChatId) {
                    await this.fetchMessages(this.currentChatId)
                }
            }
        },

        /**
         * Устанавливает эксклюзивную реакцию (удаляет старую и добавляет новую)
         */
        async setExclusiveReaction(messageId: number, reactionTypeId: number): Promise<void> {
            if (!this.currentChatId) return

            try {
                const result = await reactionApiService.setExclusiveReaction(
                    this.currentChatId, 
                    messageId, 
                    reactionTypeId
                )
                
                if (!result.success) {
                    // При ошибке перезагружаем сообщения для корректного состояния
                    await this.fetchMessages(this.currentChatId)
                }
                // Успешные реакции обновятся через WebSocket
            } catch (error) {
                if (this.currentChatId) {
                    await this.fetchMessages(this.currentChatId)
                }
            }
        },

        /**
         * Обрабатывает обновление реакций из WebSocket
         */
        handleReactionUpdate(data: any): void {
            if (!this.currentChatId) return

            // Извлекаем данные реакции из нового формата бэкенда
            const reactionData = data?.data || data
            const chatId = reactionData?.chat_id || data?.chat_id
            const messageId = reactionData?.message_id || data?.message_id
            const eventType = data?.event_type || data?.event || data?.type

            if (!chatId || !messageId || chatId !== this.currentChatId) {
                return
            }

            // Новый формат: данные реакции находятся в поле reaction
            const reactionInfo = reactionData?.reaction || reactionData
            const reactionTypeId =
                reactionInfo?.reaction_type_id ||
                reactionData?.reaction_type_id ||
                reactionData?.reaction_type ||
                data?.reaction_type_id ||
                data?.reaction_type
            const userId =
                reactionInfo?.user_id ||
                reactionData?.user_id ||
                reactionData?.user ||
                data?.user_id ||
                data?.user
            const userName = reactionInfo?.user_name || reactionData?.user_name || data?.user_name
            const userAvatar = reactionInfo?.avatar || reactionData?.avatar || data?.avatar

            const success = this.updateMessageReactionLocally(
                messageId,
                reactionTypeId,
                userId,
                eventType,
                userName,
                userAvatar,
            )

            if (success) {
                // Принудительно обновляем реактивность, создавая новый массив сообщений
                this.messages = this.messages.map(msg => ({ ...msg }))
            } else {
                // Если локальное обновление не удалось, перезагружаем сообщения
                this.fetchMessages(this.currentChatId).catch(() => {})
            }
        },

        /**
         * Локальное обновление реакции в сообщении
         */
        updateMessageReactionLocally(
            messageId: number,
            reactionTypeId: number,
            userId: string,
            eventType: string,
            userName?: string,
            userAvatar?: string | null,
        ): boolean {
            try {
                const messageIndex = this.messages.findIndex(m => m.id === messageId)
                if (messageIndex === -1) {
                    return false
                }

                const message = this.messages[messageIndex]
                let reactions = message.reactions || message.message_reactions || []

                // Создаем глубокую копию массива реакций для избежания мутаций
                const newReactions = JSON.parse(JSON.stringify(reactions))

                if (eventType === 'new_reaction' || eventType === 'reaction_added') {
                    // Сначала удаляем все предыдущие реакции этого пользователя (эксклюзивность)
                    const filteredReactions = newReactions.filter((r: any) => {
                        const reactionUserId = String(r.user || r.user_id || '')
                        return reactionUserId !== String(userId)
                    })

                    // Добавляем новую реакцию с полными данными пользователя
                    const newReaction = {
                        id: Date.now(), // Временный ID
                        reaction_type: reactionTypeId,
                        reaction_type_id: reactionTypeId,
                        user: userId,
                        user_id: userId,
                        user_name: userName,
                        avatar: userAvatar,
                        created_at: new Date().toISOString(),
                    }
                    filteredReactions.push(newReaction)

                    // Создаем новое сообщение с обновленными реакциями
                    const updatedMessage = {
                        ...message,
                        reactions: filteredReactions,
                        message_reactions: filteredReactions,
                        reaction_updated_at: new Date().toISOString(),
                    }

                    // Заменяем сообщение в массиве
                    this.messages.splice(messageIndex, 1, updatedMessage)
                } else if (eventType === 'reaction_removed') {
                    // Удаляем все реакции этого пользователя
                    const filteredReactions = newReactions.filter((r: any) => {
                        const reactionUserId = String(r.user || r.user_id || '')
                        return reactionUserId !== String(userId)
                    })

                    // Создаем новое сообщение с обновленными реакциями
                    const updatedMessage = {
                        ...message,
                        reactions: filteredReactions,
                        message_reactions: filteredReactions,
                        reaction_updated_at: new Date().toISOString(),
                    }

                    // Заменяем сообщение в массиве
                    this.messages.splice(messageIndex, 1, updatedMessage)
                }

                return true
            } catch (error) {
                return false
            }
        },

        /**
         * Сбрасывает состояние стора
         */
        reset(): void {
            this.messages = []
            this.reactionTypes = []
            this.isLoadingMessages = false
            this.isSending = false
            this.currentChatId = null
        },
    },
})