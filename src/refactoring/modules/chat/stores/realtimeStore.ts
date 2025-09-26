/**
 * Оптимизированный стор для управления WebSocket соединением
 * Принципы: KISS, DRY, YAGNI
 */

import { defineStore } from 'pinia'
import { useCentrifugeStore } from '@/refactoring/modules/centrifuge/stores/centrifugeStore'
import { useUserStore } from '@/refactoring/modules/user/stores/userStore'
import { chatWebSocketService } from '@/refactoring/modules/chat/services/chatWebSocketService'

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

interface RealtimeState {
    connectionStatus: ConnectionStatus
    isSubscribedToUserChannel: boolean
    userChannelName: string | null
    reconnectAttempts: number
}

const MAX_RECONNECT_ATTEMPTS = 5
const RECONNECT_DELAY_BASE = 1000

export const useRealtimeStore = defineStore('realtimeStore', {
    state: (): RealtimeState => ({
        connectionStatus: 'disconnected',
        isSubscribedToUserChannel: false,
        userChannelName: null,
        reconnectAttempts: 0,
    }),

    getters: {
        isConnected: (state) => state.connectionStatus === 'connected',
        isConnecting: (state) => ['connecting', 'reconnecting'].includes(state.connectionStatus),
        canReconnect: (state) => state.reconnectAttempts < MAX_RECONNECT_ATTEMPTS,
        connectionStatusText: (state) => {
            const statusMap = {
                disconnected: 'Отключено',
                connecting: 'Подключение...',
                connected: 'Подключено',
                reconnecting: 'Переподключение...',
            }
            return statusMap[state.connectionStatus]
        },
    },

    actions: {
        // === Core Actions ===
        async initialize(): Promise<boolean> {
            const userUuid = this.getCurrentUserUuid()
            if (!userUuid) {
                this.handleError('Не удалось получить UUID пользователя')
                return false
            }

            return await this.subscribeToUserChannel()
        },

        async subscribeToUserChannel(): Promise<boolean> {
            const userUuid = this.getCurrentUserUuid()
            if (!userUuid) return false

            this.connectionStatus = 'connecting'
            const channelName = `user_${userUuid}`

            try {
                await this.setupWebSocketHandlers()

                const centrifuge = useCentrifugeStore()

                // The subscribe method doesn't return a boolean, it throws on error
                await centrifuge.subscribe(channelName, (data: any) => {
                    // Handle channel messages here if needed
                    console.log(`[RealtimeStore] Received data on channel ${channelName}:`, data)
                })

                this.connectionStatus = 'connected'
                this.isSubscribedToUserChannel = true
                this.userChannelName = channelName
                this.reconnectAttempts = 0
                return true
            } catch (error) {
                this.connectionStatus = 'disconnected'
                this.handleError('Ошибка подписки на канал пользователя', error)
                return false
            }
        },

        async unsubscribeFromUserChannel(): Promise<void> {
            if (!this.isSubscribedToUserChannel || !this.userChannelName) return

            try {
                const centrifuge = useCentrifugeStore()

                // Use the correct unsubscribe method
                centrifuge.centrifugeUnsubscribe(this.userChannelName)

                this.isSubscribedToUserChannel = false
                this.connectionStatus = 'disconnected'
                this.userChannelName = null

                chatWebSocketService.resetSubscription()
            } catch (error) {
                this.handleError('Ошибка отписки от канала', error)
            }
        },

        async reconnect(): Promise<boolean> {
            if (!this.canReconnect) {
                this.connectionStatus = 'disconnected'
                return false
            }

            this.connectionStatus = 'reconnecting'
            this.reconnectAttempts++

            const delay = Math.min(
                RECONNECT_DELAY_BASE * Math.pow(2, this.reconnectAttempts - 1),
                30000,
            )
            await this.sleep(delay)

            this.reset()
            const success = await this.subscribeToUserChannel()

            if (success) {
                return true
            } else if (this.canReconnect) {
                setTimeout(() => this.reconnect(), 1000)
                return false
            } else {
                this.connectionStatus = 'disconnected'
                return false
            }
        },

        async forceReconnect(): Promise<boolean> {
            this.reconnectAttempts = 0
            await this.unsubscribeFromUserChannel()
            return await this.subscribeToUserChannel()
        },

        // === WebSocket Setup ===
        async setupWebSocketHandlers(): Promise<void> {
            chatWebSocketService.setEventHandlers({
                onNewMessage: (message, chatId) =>
                    void this.handleWebSocketEvent('newMessage', { message, chatId }),
                onChatUpdated: (chat) => void this.handleWebSocketEvent('chatUpdated', { chat }),
                onReactionAdded: (reaction, messageId) =>
                    void this.handleWebSocketEvent('reactionAdded', { reaction, messageId }),
                onMemberJoined: (member, chatId) =>
                    void this.handleWebSocketEvent('memberJoined', { member, chatId }),
                onMemberLeft: (userId, chatId) =>
                    void this.handleWebSocketEvent('memberLeft', { userId, chatId }),
                onNewInvitation: (invitation) =>
                    void this.handleWebSocketEvent('newInvitation', { invitation }),
                onInvitationRemoved: (invitation) =>
                    void this.handleWebSocketEvent('invitationRemoved', { invitation }),
            })
        },

        // === Utility Methods ===
        checkConnectionHealth(): boolean {
            const centrifuge = useCentrifugeStore()
            return centrifuge.connected && this.isSubscribedToUserChannel
        },

        reset(): void {
            this.isSubscribedToUserChannel = false
            this.userChannelName = null
            chatWebSocketService.resetSubscription()
        },

        // === Private Methods ===
        getCurrentUserUuid(): string | null {
            const userStore = useUserStore()
            return userStore.user?.uuid || userStore.user?.id || null
        },

        async handleWebSocketEvent(eventType: string, data: any): Promise<void> {
            try {
                console.log(`[RealtimeStore] WebSocket event: ${eventType}`, data)

                // Диспетчинг событий к соответствующим сторам
                switch (eventType) {
                    case 'newMessage': {
                        const { useMessagesStore } = await import('./messagesStore')
                        const messagesStore = useMessagesStore()
                        messagesStore.handleNewMessage(data.message, data.chatId)
                        break
                    }

                    case 'chatUpdated': {
                        const { useChatStore } = await import('./chatStore')
                        const chatStore = useChatStore()
                        chatStore.handleChatUpdated(data.chat)
                        break
                    }

                    case 'newInvitation': {
                        const { useMembersStore } = await import('./membersStore')
                        const membersStore = useMembersStore()
                        membersStore.handleNewInvitation(data.invitation)
                        break
                    }

                    case 'invitationRemoved': {
                        const { useMembersStore } = await import('./membersStore')
                        const membersStore = useMembersStore()
                        membersStore.handleInvitationRemoved(data.invitation)
                        break
                    }

                    case 'memberJoined':
                    case 'memberLeft': {
                        // Обновляем список чатов при изменении участников
                        const { useChatStore } = await import('./chatStore')
                        const chatStoreMembers = useChatStore()
                        await chatStoreMembers.fetchChats()
                        break
                    }

                    default:
                        console.log(`[RealtimeStore] Unhandled event type: ${eventType}`)
                }
            } catch (error) {
                this.handleError(`Ошибка обработки WebSocket события ${eventType}`, error)
            }
        },

        handleConnectionError(error: any): void {
            this.connectionStatus = 'disconnected'
            this.handleError('Ошибка WebSocket соединения', error)

            if (this.canReconnect) {
                setTimeout(() => this.reconnect(), 2000)
            }
        },

        handleError(message: string, error?: any): void {
            console.error(`[RealtimeStore] ${message}`, error)
        },

        sleep(ms: number): Promise<void> {
            return new Promise((resolve) => setTimeout(resolve, ms))
        },
    },
})
