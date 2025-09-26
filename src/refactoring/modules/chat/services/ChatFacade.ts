/**
 * Упрощенный ChatFacade для координации сложных операций
 * Принципы: KISS, DRY, YAGNI
 */

import type { IChat, IMessage } from '@/refactoring/modules/chat/types/IChat'
import { useChatStore } from '@/refactoring/modules/chat/stores/chatStore'
import { useMessagesStore } from '@/refactoring/modules/chat/stores/messagesStore'
import { useMembersStore } from '@/refactoring/modules/chat/stores/membersStore'
import { useRealtimeStore } from '@/refactoring/modules/chat/stores/realtimeStore'

export class SimpleChatFacade {
    private chatStore = useChatStore()
    private messagesStore = useMessagesStore()
    private membersStore = useMembersStore()
    private realtimeStore = useRealtimeStore()

    /**
     * Полная инициализация чата с загрузкой всех необходимых данных
     */
    async initializeChat(chatId: number): Promise<void> {
        try {
            // 1. Получаем актуальную информацию о чате
            const chat = await this.chatStore.fetchChat(chatId)

            if (!chat) {
                throw new Error(`Chat with ID ${chatId} not found`)
            }

            // 2. Устанавливаем как текущий чат
            this.chatStore.currentChat = chat

            // 3. Обновляем чат в списке, если он там есть
            const chatIndex = this.chatStore.chats.findIndex((c) => c.id === chatId)
            if (chatIndex !== -1) {
                this.chatStore.chats.splice(chatIndex, 1, chat)
            }

            // 4. Параллельно загружаем сообщения и типы реакций
            await Promise.all([
                this.messagesStore.fetchMessages(chatId),
                this.messagesStore.fetchReactionTypes(),
            ])

            // 5. Отмечаем чат как прочитанный, если есть сообщения
            const lastMessage = this.messagesStore.lastMessage
            if (lastMessage) {
                await this.chatStore.markChatAsRead(chatId, lastMessage.id)
            } else {
                await this.chatStore.markChatAsRead(chatId)
            }

            // 6. Сохраняем ID чата в localStorage
            try {
                localStorage.setItem('selectedChatId', String(chatId))
            } catch (e) {
                // Игнорируем ошибки localStorage в приватном режиме
            }
        } catch (error) {
            console.error('Ошибка инициализации чата:', error)
            throw error
        }
    }

    /**
     * Создает чат и открывает его
     */
    async createAndOpenChat(type: 'group' | 'channel' | 'dialog', payload: any): Promise<IChat> {
        const chat =
            type === 'dialog'
                ? await this.chatStore.createDialog(payload.userId)
                : await this.chatStore.createChat({ type, ...payload })

        await this.initializeChat(chat.id)
        return chat
    }

    /**
     * Принимает приглашение и открывает чат
     */
    async acceptInvitationAndOpenChat(invitationId: number): Promise<IChat | null> {
        try {
            // 1. Находим приглашение
            const invitation = this.membersStore.invitations.find((inv) => inv.id === invitationId)
            if (!invitation) {
                throw new Error('Приглашение не найдено')
            }

            // 2. Принимаем приглашение
            const success = await this.membersStore.acceptInvitation(invitationId)
            if (!success) {
                return null
            }

            // 3. Обновляем список чатов
            await this.chatStore.fetchChats()

            // 4. Открываем чат
            await this.initializeChat(invitation.chat.id)

            return invitation.chat
        } catch (error) {
            console.error('Ошибка принятия приглашения и открытия чата:', error)
            throw error
        }
    }

    /**
     * Отправляет сообщение с автообновлением чата
     */
    async sendMessage(chatId: number, content: string): Promise<IMessage | null> {
        const message = await this.messagesStore.sendMessage(chatId, content)

        if (message) {
            // Обновляем последнее сообщение в чате
            const chatIndex = this.chatStore.chats.findIndex((c) => c.id === chatId)
            if (chatIndex !== -1) {
                this.chatStore.chats[chatIndex].last_message = message
            }
        }

        return message
    }

    /**
     * Инициализирует модуль
     */
    async initialize(): Promise<void> {
        await this.chatStore.initializeOnce()
        await this.realtimeStore.initialize()
    }

    /**
     * Проверяет состояние системы
     */
    getStatus() {
        return {
            isInitialized: this.chatStore.isInitialized,
            isConnected: this.realtimeStore.isConnected,
            chatsCount: this.chatStore.chats.length,
            messagesCount: this.messagesStore.messages.length,
        }
    }
}

// Создаем глобальный экземпляр
export const simpleChatFacade = new SimpleChatFacade()

// Для обратной совместимости
export const chatFacade = simpleChatFacade
