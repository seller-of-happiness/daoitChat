/*
 * WebSocket сервис для обработки центрифуго событий чат модуля
 *
 * Обрабатывает:
 * - Новые сообщения
 * - Обновления чатов
 * - Изменения реакций
 * - Обновления участников
 * - Новые приглашения
 *
 * Использует паттерн Observer для уведомления подписчиков
 */

import type { IMessage, IChat, IChatInvitation } from '@/refactoring/modules/chat/types/IChat'

// Типы событий WebSocket
export type WebSocketEventType =
    | 'message'
    | 'new_message'
    | 'chat_updated'
    | 'reaction_added'
    | 'reaction_removed'
    | 'new_reaction'
    | 'reaction_update'
    | 'reaction_changed'
    | 'member_added'
    | 'member_removed'
    | 'new_invite'

// Интерфейс для данных события
export interface WebSocketEventData {
    event_type?: string
    event?: string
    type?: string
    data?: any
    [key: string]: any
}

// Интерфейс для обработчиков событий
export interface WebSocketEventHandlers {
    onNewMessage?: (message: IMessage, chatId: number) => void
    onChatUpdated?: (chat: IChat) => void
    onReactionUpdate?: (data: any) => void
    onMembershipUpdate?: (data: any) => void
    onNewInvitation?: (data: any) => void
    onInvitationRemoved?: (data: any) => void
}

/**
 * Сервис для обработки WebSocket событий чата
 */
export class ChatWebSocketService {
    private handlers: WebSocketEventHandlers = {}
    private isSubscribedToUserChannel = false

    /**
     * Регистрирует обработчики событий
     */
    setEventHandlers(handlers: Partial<WebSocketEventHandlers>): void {
        this.handlers = { ...this.handlers, ...handlers }
    }

    /**
     * Получает UUID текущего пользователя для подписки на центрифуго
     */
    getCurrentUserUuid(): string | null {
        // Эта логика будет передана в реалтайм стор
        return null
    }

    /**
     * Подписывается на единый канал пользователя для получения уведомлений о всех чатах
     * Используется новая система: один канал chats:user#${userUuid} вместо подписки на каждый чат отдельно
     */
    subscribeToUserChannel(userUuid: string, centrifugeService: any): void {
        if (!userUuid || this.isSubscribedToUserChannel) {
            return
        }

        const channelName = `chats:user#${userUuid}`

        centrifugeService.subscribe(channelName, (data: any) => {
            this.handleCentrifugoMessage(data)
        })

        this.isSubscribedToUserChannel = true
    }

    /**
     * Сбрасывает состояние подписки (например, при логауте)
     */
    resetSubscription(): void {
        this.isSubscribedToUserChannel = false
    }

    /**
     * Основной обработчик сообщений из центрифуго
     */
    handleCentrifugoMessage(data: WebSocketEventData): void {
        const eventType = this.extractEventType(data)

        switch (eventType) {
            case 'message':
            case 'new_message':
                this.handleNewMessageEvent(data)
                break

            case 'chat_updated':
                this.handleChatUpdatedEvent(data)
                break

            case 'reaction_added':
            case 'reaction_removed':
            case 'new_reaction':
            case 'reaction_update':
            case 'reaction_changed':
                this.handleReactionUpdateEvent(data)
                break

            case 'member_added':
            case 'member_removed':
                this.handleMembershipUpdateEvent(data)
                break

            case 'new_invite':
            case 'invitation':
            case 'new_invitation':
            case 'chat_invitation':
                this.handleNewInvitationEvent(data)
                break

            case 'invitation_removed':
            case 'invitation_cancelled':
            case 'invite_removed':
                this.handleInvitationRemovedEvent(data)
                break

            default:
                this.handleFallbackEvents(data)
                break
        }
    }

    /**
     * Извлекает тип события из данных
     */
    private extractEventType(data: WebSocketEventData): string | null {
        return data?.event_type || data?.event || data?.type || null
    }

    /**
     * Обрабатывает событие нового сообщения
     */
    private handleNewMessageEvent(data: WebSocketEventData): void {
        try {
            // Проверяем структуру данных из центрифуго
            const messageData = data?.data?.message || data.message || data.object || data
            const chatId = data?.data?.chat_id || data.chat_id

            if (messageData && chatId && this.handlers.onNewMessage) {
                this.handlers.onNewMessage(messageData, chatId)
            }
        } catch (error) {
            console.warn('Ошибка обработки события нового сообщения:', error)
        }
    }

    /**
     * Обрабатывает событие обновления чата
     */
    private handleChatUpdatedEvent(data: WebSocketEventData): void {
        try {
            const chatData = data?.data?.chat || data.chat || data.object || data

            if (chatData && this.handlers.onChatUpdated) {
                this.handlers.onChatUpdated(chatData)
            }
        } catch (error) {
            console.warn('Ошибка обработки события обновления чата:', error)
        }
    }

    /**
     * Обрабатывает событие обновления реакций
     */
    private handleReactionUpdateEvent(data: WebSocketEventData): void {
        try {
            if (this.handlers.onReactionUpdate) {
                this.handlers.onReactionUpdate(data)
            }
        } catch (error) {
            console.warn('Ошибка обработки события реакции:', error)
        }
    }

    /**
     * Обрабатывает событие изменения участников
     */
    private handleMembershipUpdateEvent(data: WebSocketEventData): void {
        try {
            if (this.handlers.onMembershipUpdate) {
                this.handlers.onMembershipUpdate(data)
            }
        } catch (error) {
            console.warn('Ошибка обработки события изменения участников:', error)
        }
    }

    /**
     * Обрабатывает событие нового приглашения
     */
    private handleNewInvitationEvent(data: WebSocketEventData): void {
        try {
            console.log('[ChatWebSocketService] Получено событие нового приглашения:', data)

            if (this.handlers.onNewInvitation) {
                this.handlers.onNewInvitation(data)
            } else {
                console.warn('[ChatWebSocketService] Обработчик onNewInvitation не установлен')
            }
        } catch (error) {
            console.warn('Ошибка обработки события нового приглашения:', error)
        }
    }

    /**
     * Обрабатывает событие удаления приглашения
     */
    private handleInvitationRemovedEvent(data: WebSocketEventData): void {
        try {
            console.log('[ChatWebSocketService] Получено событие удаления приглашения:', data)

            if (this.handlers.onInvitationRemoved) {
                this.handlers.onInvitationRemoved(data)
            } else {
                console.warn('[ChatWebSocketService] Обработчик onInvitationRemoved не установлен')
            }
        } catch (error) {
            console.warn('Ошибка обработки события удаления приглашения:', error)
        }
    }

    /**
     * Обрабатывает fallback события (для совместимости)
     */
    private handleFallbackEvents(data: WebSocketEventData): void {
        try {
            // Fallback: если нет event_type, но есть id и content - считаем новым сообщением
            if (data?.id && data?.content !== undefined && this.handlers.onNewMessage) {
                this.handlers.onNewMessage(data as IMessage, data.chat_id)
            }
            // Fallback: если есть message_id и reaction_type - считаем обновлением реакции
            else if (
                data?.message_id &&
                (data?.reaction_type_id || data?.reaction_type) &&
                this.handlers.onReactionUpdate
            ) {
                this.handlers.onReactionUpdate(data)
            }
            // Fallback: если есть chat и created_by - возможно это приглашение
            else if (data?.chat && data?.created_by && this.handlers.onNewInvitation) {
                this.handlers.onNewInvitation(data)
            }
        } catch (error) {
            console.warn('Ошибка обработки fallback события:', error)
        }
    }

    /**
     * Проверяет, подписан ли сервис на пользовательский канал
     */
    isSubscribed(): boolean {
        return this.isSubscribedToUserChannel
    }
}

// Создаем глобальный экземпляр сервиса
export const chatWebSocketService = new ChatWebSocketService()
