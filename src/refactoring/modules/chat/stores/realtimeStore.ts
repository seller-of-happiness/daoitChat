/*
 * Стор для управления realtime соединением и WebSocket событиями
 * 
 * Отвечает за:
 * - Подписку на пользовательский канал центрифуго
 * - Диспетчинг событий к соответствующим сторам
 * - Переподключение при обрывах связи
 * - Управление состоянием подключения
 */

import { defineStore } from 'pinia'
import { useCentrifugeStore } from '@/refactoring/modules/centrifuge/stores/centrifugeStore'
import { useUserStore } from '@/refactoring/modules/user/stores/userStore'
import { chatWebSocketService } from '@/refactoring/modules/chat/services/chatWebSocketService'

interface RealtimeStoreState {
    isSubscribedToUserChannel: boolean
    connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting'
    userChannelName: string | null
    reconnectAttempts: number
    maxReconnectAttempts: number
}

export const useRealtimeStore = defineStore('realtimeStore', {
    state: (): RealtimeStoreState => ({
        isSubscribedToUserChannel: false,
        connectionStatus: 'disconnected',
        userChannelName: null,
        reconnectAttempts: 0,
        maxReconnectAttempts: 5,
    }),

    getters: {
        /**
         * Проверка подключения к каналу
         */
        isConnected: (state) => state.connectionStatus === 'connected',

        /**
         * Проверка процесса подключения
         */
        isConnecting: (state) => state.connectionStatus === 'connecting' || state.connectionStatus === 'reconnecting',

        /**
         * Можно ли выполнить переподключение
         */
        canReconnect: (state) => state.reconnectAttempts < state.maxReconnectAttempts,

        /**
         * Статус подключения для UI
         */
        connectionStatusText: (state) => {
            switch (state.connectionStatus) {
                case 'connected':
                    return 'Подключено'
                case 'connecting':
                    return 'Подключение...'
                case 'reconnecting':
                    return `Переподключение... (${state.reconnectAttempts}/${state.maxReconnectAttempts})`
                case 'disconnected':
                default:
                    return 'Отключено'
            }
        },
    },

    actions: {
        /**
         * Получает UUID текущего пользователя для подписки на центрифуго
         */
        getCurrentUserUuid(): string | null {
            const userStore = useUserStore()
            return userStore.user?.uuid || userStore.user?.id?.toString() || null
        },

        /**
         * Подписывается на единый канал пользователя для получения уведомлений о всех чатах
         * Используется новая система: один канал chats:user#${userUuid} вместо подписки на каждый чат отдельно
         */
        async subscribeToUserChannel(): Promise<boolean> {
            if (this.isSubscribedToUserChannel) {
                return true
            }

            const userUuid = this.getCurrentUserUuid()
            if (!userUuid) {
                console.warn('Не удалось получить UUID пользователя для подписки')
                return false
            }

            const channelName = `chats:user#${userUuid}`
            this.userChannelName = channelName
            this.connectionStatus = 'connecting'

            try {
                const centrifuge = useCentrifugeStore()
                
                // Настраиваем обработчики событий для WebSocket сервиса
                this.setupWebSocketHandlers()

                // Подписываемся на канал
                await centrifuge.subscribe(channelName, (data: any) => {
                    chatWebSocketService.handleCentrifugoMessage(data)
                })

                // Check if subscription was successful
                if (centrifuge.subscriptions.has(channelName)) {
                    this.isSubscribedToUserChannel = true
                    this.connectionStatus = 'connected'
                    this.reconnectAttempts = 0
                    
                    console.log(`Подписка на канал ${channelName} успешна`)
                    return true
                } else {
                    this.connectionStatus = 'disconnected'
                    console.error(`Не удалось подписаться на канал ${channelName}`)
                    return false
                }
            } catch (error) {
                this.connectionStatus = 'disconnected'
                console.error('Ошибка подписки на канал:', error)
                return false
            }
        },

        /**
         * Настраивает обработчики событий для WebSocket сервиса
         */
        setupWebSocketHandlers(): void {
            // Импортируем сторы динамически, чтобы избежать циклических зависимостей
            const setupHandlers = async () => {
                const { useMessagesStore } = await import('./messagesStore')
                const { useMembersStore } = await import('./membersStore')
                const { useChatStore } = await import('./chatStore')

                const messagesStore = useMessagesStore()
                const membersStore = useMembersStore()
                const chatStore = useChatStore()

                chatWebSocketService.setEventHandlers({
                    onNewMessage: (message, chatId) => {
                        messagesStore.handleNewMessage(message, chatId)
                        // Также уведомляем главный чат стор для обновления списка чатов
                        if (chatStore.handleNewMessage) {
                            chatStore.handleNewMessage(message, chatId)
                        }
                    },
                    onChatUpdated: (chat) => {
                        if (chatStore.handleChatUpdated) {
                            chatStore.handleChatUpdated(chat)
                        }
                    },
                    onReactionUpdate: (data) => {
                        messagesStore.handleReactionUpdate(data)
                    },
                    onMembershipUpdate: (data) => {
                        membersStore.handleMembershipUpdate(data)
                        // Также уведомляем главный чат стор
                        if (chatStore.handleMembershipUpdate) {
                            chatStore.handleMembershipUpdate(data)
                        }
                    },
                    onNewInvitation: (data) => {
                        membersStore.handleNewInvitation(data)
                    },
                })
            }

            setupHandlers().catch(error => {
                console.error('Ошибка настройки обработчиков WebSocket:', error)
            })
        },

        /**
         * Отписывается от пользовательского канала
         */
        async unsubscribeFromUserChannel(): Promise<void> {
            if (!this.isSubscribedToUserChannel || !this.userChannelName) {
                return
            }

            try {
                const centrifuge = useCentrifugeStore()
                await centrifuge.disconnect()
                
                this.isSubscribedToUserChannel = false
                this.connectionStatus = 'disconnected'
                this.userChannelName = null
                
                // Сбрасываем состояние WebSocket сервиса
                chatWebSocketService.resetSubscription()
                
                console.log('Отписка от пользовательского канала выполнена')
            } catch (error) {
                console.error('Ошибка отписки от канала:', error)
            }
        },

        /**
         * Переподключается к каналу при обрыве связи
         */
        async reconnect(): Promise<boolean> {
            if (!this.canReconnect) {
                console.warn('Превышено максимальное количество попыток переподключения')
                return false
            }

            this.reconnectAttempts++
            this.connectionStatus = 'reconnecting'

            console.log(`Попытка переподключения ${this.reconnectAttempts}/${this.maxReconnectAttempts}`)

            // Ждем перед попыткой переподключения
            const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)
            await new Promise(resolve => setTimeout(resolve, delay))

            // Сбрасываем состояние подписки
            this.isSubscribedToUserChannel = false
            chatWebSocketService.resetSubscription()

            // Пытаемся подписаться заново
            const success = await this.subscribeToUserChannel()
            
            if (success) {
                console.log('Переподключение успешно')
                return true
            } else {
                console.warn(`Попытка переподключения ${this.reconnectAttempts} не удалась`)
                
                if (this.canReconnect) {
                    // Планируем следующую попытку
                    setTimeout(() => {
                        this.reconnect()
                    }, delay)
                } else {
                    this.connectionStatus = 'disconnected'
                }
                
                return false
            }
        },

        /**
         * Принудительно переподключается к каналу
         */
        async forceReconnect(): Promise<boolean> {
            console.log('Принудительное переподключение...')
            
            // Сбрасываем счетчик попыток
            this.reconnectAttempts = 0
            
            // Отписываемся от текущего канала
            await this.unsubscribeFromUserChannel()
            
            // Подписываемся заново
            return await this.subscribeToUserChannel()
        },

        /**
         * Обрабатывает ошибки подключения
         */
        handleConnectionError(error: any): void {
            console.error('Ошибка WebSocket соединения:', error)
            
            this.connectionStatus = 'disconnected'
            
            // Автоматически пытаемся переподключиться
            if (this.canReconnect) {
                setTimeout(() => {
                    this.reconnect()
                }, 2000)
            }
        },

        /**
         * Проверяет статус подключения к центрифуго
         */
        checkConnectionHealth(): boolean {
            const centrifuge = useCentrifugeStore()
            
            // Проверяем состояние центрифуго
            if (!centrifuge.connected) {
                this.connectionStatus = 'disconnected'
                this.isSubscribedToUserChannel = false
                return false
            }
            
            return this.isSubscribedToUserChannel
        },

        /**
         * Инициализирует realtime подключение
         */
        async initialize(): Promise<boolean> {
            console.log('Инициализация realtime подключения...')
            
            // Проверяем наличие пользователя
            const userUuid = this.getCurrentUserUuid()
            if (!userUuid) {
                console.warn('Нет данных пользователя для инициализации realtime')
                return false
            }
            
            // Подписываемся на канал
            const success = await this.subscribeToUserChannel()
            
            if (success) {
                console.log('Realtime подключение инициализировано')
            } else {
                console.error('Не удалось инициализировать realtime подключение')
            }
            
            return success
        },

        /**
         * Сбрасывает состояние стора (например, при логауте)
         */
        reset(): void {
            this.unsubscribeFromUserChannel()
            this.isSubscribedToUserChannel = false
            this.connectionStatus = 'disconnected'
            this.userChannelName = null
            this.reconnectAttempts = 0
            chatWebSocketService.resetSubscription()
        },
    },
})