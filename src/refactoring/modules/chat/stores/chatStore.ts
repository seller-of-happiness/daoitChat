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
import type { IChat } from '@/refactoring/modules/chat/types/IChat'
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
    },
})