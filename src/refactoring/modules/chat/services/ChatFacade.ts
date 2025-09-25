/*
 * ChatFacade - фасад для сложных операций чат модуля
 * 
 * Предоставляет высокоуровневые методы, которые координируют работу
 * между несколькими сторами и API сервисами для выполнения сложных операций.
 * 
 * Паттерн Facade упрощает взаимодействие с системой чатов,
 * скрывая сложность координации между компонентами.
 */

import type { IChat, IMessage } from '@/refactoring/modules/chat/types/IChat'
import { useChatStore } from '@/refactoring/modules/chat/stores/chatStore'
import { useMessagesStore } from '@/refactoring/modules/chat/stores/messagesStore'
import { useMembersStore } from '@/refactoring/modules/chat/stores/membersStore'
import { useSearchStore } from '@/refactoring/modules/chat/stores/searchStore'
import { useRealtimeStore } from '@/refactoring/modules/chat/stores/realtimeStore'

export class ChatFacade {
    private chatStore = useChatStore()
    private messagesStore = useMessagesStore()
    private membersStore = useMembersStore()
    private searchStore = useSearchStore()
    private realtimeStore = useRealtimeStore()

    /**
     * Полная инициализация чата с загрузкой всех необходимых данных
     */
    async initializeChat(chatId: number): Promise<void> {
        try {
            // 1. Получаем актуальную информацию о чате
            const chat = await this.chatStore.fetchChat(chatId)
            
            // 2. Устанавливаем как текущий чат
            this.chatStore.currentChat = chat
            
            // 3. Обновляем чат в списке, если он там есть
            const chatIndex = this.chatStore.chats.findIndex(c => c.id === chatId)
            if (chatIndex !== -1) {
                this.chatStore.chats.splice(chatIndex, 1, chat)
            }

            // 4. Параллельно загружаем сообщения и типы реакций
            await Promise.all([
                this.messagesStore.fetchMessages(chatId),
                this.messagesStore.fetchReactionTypes()
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
     * Создает новый чат и сразу открывает его
     */
    async createAndOpenChat(type: 'group' | 'channel', payload: {
        title: string
        description?: string
        icon?: File | null
    }): Promise<IChat> {
        try {
            // 1. Создаем чат
            const chat = await this.chatStore.createChat({ type, ...payload })
            
            // 2. Сразу открываем его
            await this.initializeChat(chat.id)
            
            return chat
        } catch (error) {
            console.error('Ошибка создания и открытия чата:', error)
            throw error
        }
    }

    /**
     * Создает диалог с пользователем и сразу открывает его
     */
    async createAndOpenDialog(userId: string): Promise<IChat> {
        try {
            // 1. Создаем диалог
            const chat = await this.chatStore.createDialog(userId)
            
            // 2. Сразу открываем его
            await this.initializeChat(chat.id)
            
            return chat
        } catch (error) {
            console.error('Ошибка создания и открытия диалога:', error)
            throw error
        }
    }

    /**
     * Принимает приглашение и открывает чат
     */
    async acceptInvitationAndOpenChat(invitationId: number): Promise<IChat | null> {
        try {
            // 1. Находим приглашение
            const invitation = this.membersStore.invitations.find(inv => inv.id === invitationId)
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
     * Поиск и создание диалога из результатов поиска
     */
    async searchAndCreateDialog(query: string, userId: string): Promise<IChat> {
        try {
            // 1. Выполняем поиск
            const results = await this.searchStore.searchImmediate(query)
            
            // 2. Создаем диалог
            const chat = await this.createAndOpenDialog(userId)
            
            // 3. Очищаем результаты поиска
            this.searchStore.clearSearch()
            
            return chat
        } catch (error) {
            console.error('Ошибка поиска и создания диалога:', error)
            throw error
        }
    }

    /**
     * Отправляет сообщение и обновляет состояние чата
     */
    async sendMessageAndUpdateChat(chatId: number, content: string, files?: File[]): Promise<IMessage | null> {
        try {
            let message: IMessage | null = null

            // 1. Отправляем сообщение
            if (files && files.length > 0) {
                message = await this.messagesStore.sendMessageWithFiles(chatId, content, files)
            } else {
                message = await this.messagesStore.sendMessage(chatId, content)
            }

            if (!message) {
                return null
            }

            // 2. Обновляем информацию о последнем сообщении в чате
            const chatIndex = this.chatStore.chats.findIndex(c => c.id === chatId)
            if (chatIndex !== -1) {
                const updatedChat = {
                    ...this.chatStore.chats[chatIndex],
                    last_message: message,
                    last_message_id: message.id,
                }
                this.chatStore.chats.splice(chatIndex, 1, updatedChat)
                
                // Пересортируем чаты чтобы отправленное сообщение подняло чат в топ
                this.chatStore.chats = this.sortChatsByLastMessage(this.chatStore.chats)
            }

            return message
        } catch (error) {
            console.error('Ошибка отправки сообщения и обновления чата:', error)
            throw error
        }
    }

    /**
     * Управляет участниками чата (добавление/удаление) с обновлением состояния
     */
    async manageChatMembers(chatId: number, action: 'add' | 'remove', userIds: string[]): Promise<boolean> {
        try {
            let success = false

            // 1. Выполняем операцию
            if (action === 'add') {
                success = await this.membersStore.addMembersToChat(chatId, userIds)
            } else if (action === 'remove' && userIds.length === 1) {
                success = await this.membersStore.removeMemberFromChat(chatId, userIds[0])
            } else {
                throw new Error('Неподдерживаемая операция с участниками')
            }

            if (!success) {
                return false
            }

            // 2. Обновляем информацию о чате
            const updatedChat = await this.chatStore.fetchChat(chatId)
            
            // 3. Обновляем в списке чатов
            const chatIndex = this.chatStore.chats.findIndex(c => c.id === chatId)
            if (chatIndex !== -1) {
                this.chatStore.chats.splice(chatIndex, 1, updatedChat)
            }

            // 4. Обновляем текущий чат, если это он
            if (this.chatStore.currentChat?.id === chatId) {
                this.chatStore.currentChat = updatedChat
            }

            return true
        } catch (error) {
            console.error('Ошибка управления участниками чата:', error)
            throw error
        }
    }

    /**
     * Полный сброс состояния чат модуля
     */
    async resetChatModule(): Promise<void> {
        try {
            // 1. Отключаемся от realtime
            this.realtimeStore.reset()
            
            // 2. Сбрасываем все сторы
            this.chatStore.resetInitialization()
            
            // 3. Очищаем localStorage
            try {
                localStorage.removeItem('selectedChatId')
            } catch (e) {
                // Игнорируем ошибки localStorage
            }

        } catch (error) {
            console.error('Ошибка сброса чат модуля:', error)
            throw error
        }
    }

    /**
     * Восстанавливает состояние чат модуля из localStorage
     */
    async restoreChatModuleState(): Promise<void> {
        try {
            // 1. Инициализируем модуль
            await this.chatStore.initializeOnce()
            
            // 2. Восстанавливаем последний выбранный чат
            try {
                const selectedChatId = localStorage.getItem('selectedChatId')
                if (selectedChatId) {
                    const chatId = parseInt(selectedChatId, 10)
                    if (!isNaN(chatId)) {
                        // Ищем чат в загруженном списке
                        const chat = this.chatStore.chats.find(c => c.id === chatId)
                        if (chat) {
                            await this.initializeChat(chatId)
                        }
                    }
                }
            } catch (e) {
                // Игнорируем ошибки восстановления состояния
            }

        } catch (error) {
            console.error('Ошибка восстановления состояния чат модуля:', error)
            throw error
        }
    }

    /**
     * Проверяет здоровье всей системы чатов
     */
    checkSystemHealth(): {
        isInitialized: boolean
        isConnected: boolean
        hasChats: boolean
        hasMessages: boolean
    } {
        return {
            isInitialized: this.chatStore.isInitialized,
            isConnected: this.realtimeStore.isConnected,
            hasChats: this.chatStore.chats.length > 0,
            hasMessages: this.messagesStore.hasMessages,
        }
    }

    /**
     * Вспомогательный метод для сортировки чатов по времени последнего сообщения
     */
    private sortChatsByLastMessage(chats: IChat[]): IChat[] {
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
    }
}

// Создаем глобальный экземпляр фасада
export const chatFacade = new ChatFacade()