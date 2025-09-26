/**
 * Оптимизированный стор для управления сообщениями
 * Принципы: KISS, DRY, YAGNI
 */

import { defineStore } from 'pinia'
import type { IMessage, IReactionType } from '@/refactoring/modules/chat/types/IChat'
import { messageApiService } from '@/refactoring/modules/chat/services/messageApi'
import { reactionApiService } from '@/refactoring/modules/chat/services/reactionApi'

interface MessagesState {
    messages: IMessage[]
    reactionTypes: IReactionType[]
    isLoadingMessages: boolean
    isSending: boolean
    currentChatId: number | null
}

const sortMessages = (messages: IMessage[]): IMessage[] => {
    return [...messages].sort((a, b) => {
        const aTime = new Date(a.created_at).getTime()
        const bTime = new Date(b.created_at).getTime()
        return aTime - bTime
    })
}

export const useMessagesStore = defineStore('messagesStore', {
    state: (): MessagesState => ({
        messages: [],
        reactionTypes: [],
        isLoadingMessages: false,
        isSending: false,
        currentChatId: null,
    }),

    getters: {
        sortedMessages: (state) => sortMessages(state.messages),
        hasMessages: (state) => state.messages.length > 0,
        lastMessage: (state) => {
            const sorted = sortMessages(state.messages)
            return sorted[sorted.length - 1] || null
        },
    },

    actions: {
        // === Core Actions ===
        async fetchMessages(chatId: number): Promise<void> {
            if (this.currentChatId === chatId && this.hasMessages) return

            this.isLoadingMessages = true
            this.currentChatId = chatId

            try {
                const result = await messageApiService.fetchMessages(chatId)
                if (result.success && result.data) {
                    this.messages = result.data
                }
            } catch (error) {
                this.handleError('Не удалось загрузить сообщения', error)
            } finally {
                this.isLoadingMessages = false
            }
        },

        async sendMessage(chatId: number, content: string): Promise<IMessage | null> {
            if (!content.trim() || this.isSending) return null

            this.isSending = true

            try {
                const result = await messageApiService.sendMessage(chatId, content.trim())
                if (result.success && result.data) {
                    this.addMessage(result.data)
                    return result.data
                }
                return null
            } catch (error) {
                this.handleError('Не удалось отправить сообщение', error)
                return null
            } finally {
                this.isSending = false
            }
        },

        async sendMessageWithFiles(
            chatId: number,
            content: string,
            files: File[],
        ): Promise<IMessage | null> {
            if (this.isSending) return null

            this.isSending = true

            try {
                const result = await messageApiService.sendMessageWithFiles(chatId, content, files)
                if (result.success && result.data) {
                    this.addMessage(result.data)
                    return result.data
                }
                return null
            } catch (error) {
                this.handleError('Не удалось отправить сообщение с файлами', error)
                return null
            } finally {
                this.isSending = false
            }
        },

        async updateMessage(chatId: number, messageId: number, content: string): Promise<void> {
            try {
                const result = await messageApiService.updateMessage(chatId, messageId, { content })
                if (result.success && result.data) {
                    this.replaceMessage(result.data)
                }
            } catch (error) {
                this.handleError('Не удалось обновить сообщение', error)
            }
        },

        async deleteMessage(chatId: number, messageId: number): Promise<void> {
            try {
                const result = await messageApiService.deleteMessage(chatId, messageId)
                if (result.success) {
                    this.removeMessage(messageId)
                }
            } catch (error) {
                this.handleError('Не удалось удалить сообщение', error)
            }
        },

        // === Reactions ===
        async fetchReactionTypes(): Promise<void> {
            if (this.reactionTypes.length > 0) return

            try {
                const result = await reactionApiService.fetchReactionTypes()
                if (result.success && result.data) {
                    this.reactionTypes = result.data
                }
            } catch (error) {
                this.handleError('Не удалось загрузить типы реакций', error)
            }
        },

        async addReaction(messageId: number, reactionTypeId: number): Promise<void> {
            try {
                const result = await reactionApiService.addReaction(messageId, {
                    reaction_type_id: reactionTypeId,
                })
                if (result.success && result.data) {
                    this.updateMessageReactions(messageId, result.data.reactions || [])
                }
            } catch (error) {
                this.handleError('Не удалось добавить реакцию', error)
            }
        },

        async removeReaction(messageId: number): Promise<void> {
            try {
                const result = await reactionApiService.removeReaction(messageId)
                if (result.success && result.data) {
                    this.updateMessageReactions(messageId, result.data.reactions || [])
                }
            } catch (error) {
                this.handleError('Не удалось удалить реакцию', error)
            }
        },

        // === State Management ===
        addMessage(message: IMessage): void {
            const existingIndex = this.messages.findIndex((m) => m.id === message.id)
            if (existingIndex >= 0) {
                this.messages[existingIndex] = message
            } else {
                this.messages.push(message)
            }
        },

        replaceMessage(message: IMessage): void {
            const index = this.messages.findIndex((m) => m.id === message.id)
            if (index >= 0) {
                this.messages[index] = message
            }
        },

        removeMessage(messageId: number): void {
            this.messages = this.messages.filter((m) => m.id !== messageId)
        },

        updateMessageReactions(messageId: number, reactions: any[]): void {
            const message = this.messages.find((m) => m.id === messageId)
            if (message) {
                message.reactions = reactions
                message.reaction_updated_at = new Date().toISOString()
            }
        },

        clearMessages(): void {
            this.messages = []
            this.currentChatId = null
        },

        // === WebSocket Handlers ===
        handleNewMessage(message: IMessage, chatId: number): void {
            if (this.currentChatId === chatId) {
                this.addMessage(message)
            }
        },

        handleMessageUpdated(message: IMessage): void {
            this.replaceMessage(message)
        },

        handleMessageDeleted(messageId: number): void {
            this.removeMessage(messageId)
        },

        // === Error Handling ===
        handleError(message: string, error: any): void {
            console.error(`[MessagesStore] ${message}:`, error)

            // Здесь можно добавить интеграцию с системой уведомлений
            // const feedbackStore = useFeedbackStore()
            // feedbackStore.showToast({ type: 'error', title: 'Ошибка', message })
        },
    },
})
