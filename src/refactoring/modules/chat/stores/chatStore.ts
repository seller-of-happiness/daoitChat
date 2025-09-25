/*
 * Хранилище чатов (чат-центр приложения)
 *
 * Основные функции:
 * - Загрузка и управление списком чатов
 * - Открытие чата, загрузка сообщений и подписка на realtime-обновления
 * - Отправка сообщений и загрузка вложений
 * - Работа с реакциями: загрузка типов, добавление/удаление, эксклюзивная постановка
 * - Поиск чатов и создание новых (группы/каналы/личные диалоги)
 * - Управление приглашениями в чаты
 * - Управление участниками чатов (добавление/удаление)
 *
 * Особенности:
 * - Сообщения упорядочиваются по времени (старые → новые)
 * - Чаты сортируются по времени последнего сообщения (новые → старые)
 * - Восстановление последнего выбранного чата через localStorage
 * - Realtime-подписка через центрифуго на единый канал chats:user#user_uuid
 * - Debounced-поиск с отображением серверных результатов
 * - Унифицированная обработка серверных ответов (поддержка data.results и плоского ответа)
 * - Управление глобальной индикацией загрузки и показом уведомлений
 * - Отдельные эндпоинты для создания диалогов, групп и каналов
 */
// @ts-nocheck - Временно отключаем проверки типов для Pinia store
import axios from 'axios'
import { defineStore } from 'pinia'
import { BASE_URL } from '@/refactoring/environment/environment'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import type {
    IChat,
    IChatStoreState,
    IMessage,
    IReactionType,
    IEmployee,
    ISearchResults,
    IChatInvitation,
    IChatUpdatePayload,
} from '@/refactoring/modules/chat/types/IChat'
import { useCentrifugeStore } from '@/refactoring/modules/centrifuge/stores/centrifugeStore'
import { useUserStore } from '@/refactoring/modules/user/stores/userStore'
import { soundService } from '@/refactoring/utils/soundService'
import { useCurrentUser, isMyMessage } from '@/refactoring/modules/chat/composables/useCurrentUser'
import { useUnreadMessages } from '@/refactoring/modules/chat/composables/useUnreadMessages'

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

// Сортировка чатов по времени последнего сообщения (новые сверху)
function sortChatsByLastMessage(chats: IChat[]): IChat[] {
    return [...chats].sort((a, b) => {
        // Сначала пытаемся сравнить по времени последнего сообщения
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

// Глобальный экземпляр для управления непрочитанными сообщениями в заголовке
const globalUnreadMessages = useUnreadMessages()

// Обеспечиваем инициализацию событий в клиентском коде
if (typeof window !== 'undefined') {
    // Инициализируем события после загрузки DOM
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            globalUnreadMessages.initializeEventListeners()
        })
    } else {
        globalUnreadMessages.initializeEventListeners()
    }
}

const chatStore = defineStore('chatStore', {
    state: (): IChatStoreState => ({
        chats: [],
        currentChat: null,
        messages: [],
        reactionTypes: [],
        isSending: false,
        searchResults: null,
        isSearching: false,
        // Флаг для предотвращения дублирования инициализации
        isInitialized: false,
        isInitializing: false,
        // Приглашения в чаты
        invitations: [],
        // Состояние загрузки сообщений
        isLoadingMessages: false,
        // Состояние загрузки списка чатов
        isLoadingChats: false,
        isSubscribedToUserChannel: false,
    }),
    actions: {
        // Получает UUID текущего пользователя для подписки на центрифуго
        getCurrentUserUuid(): string | null {
            const userStore = useUserStore()
            return userStore.user?.uuid || userStore.user?.id?.toString() || null
        },

        // Подписывается на единый канал пользователя для получения уведомлений о всех чатах
        // Используется новая система: один канал chats:user#${userUuid} вместо подписки на каждый чат отдельно
        subscribeToUserChannel(): void {
            // Проверяем, не подписаны ли мы уже
            if (this.isSubscribedToUserChannel) {
                console.log('[ChatStore] Уже подписаны на канал пользователя')
                return
            }

            const centrifuge = useCentrifugeStore()
            const userUuid = this.getCurrentUserUuid()

            if (!userUuid) {
                console.warn(
                    '[ChatStore] Не удалось получить UUID пользователя для подписки на канал',
                )
                return
            }

            const channelName = `chats:user#${userUuid}`
            console.log('[ChatStore] Подписываемся на канал:', channelName)
            console.log(
                '[ChatStore] Состояние Centrifuge перед подпиской:',
                centrifuge.diagnostics(),
            )

            centrifuge.subscribe(channelName, (data: any) => {
                console.log('[ChatStore] Получено сообщение из centrifuge:', data)

                // Дополнительное логирование для приглашений
                const eventType = data?.event_type || data?.event || data?.type
                if (
                    eventType &&
                    (eventType.includes('invite') || eventType.includes('invitation'))
                ) {
                    console.log('[CHAT INVITATION DEBUG] Обрабатываем приглашение:', {
                        eventType,
                        data,
                        timestamp: new Date().toISOString(),
                        userUuid,
                        channelName,
                    })
                }

                this.handleCentrifugoMessage(data)
            })

            this.isSubscribedToUserChannel = true
            console.log('[ChatStore] Подписка на канал успешно установлена:', channelName)
        },

        // Обрабатывает сообщения из центрифуго
        handleCentrifugoMessage(data: any): void {
            const eventType = data?.event_type || data?.event || data?.type

            // ДОБАВЛЯЕМ: Детальное логирование всех сообщений
            console.log('[ChatStore] Обрабатываем WebSocket сообщение:', {
                eventType,
                hasData: !!data?.data,
                dataKeys: data?.data ? Object.keys(data.data) : [],
                rawData: data,
                timestamp: new Date().toISOString(),
            })

            // ДОБАВЛЯЕМ: Специальная проверка для возможных типов приглашений
            if (eventType) {
                const invitationKeywords = ['invite', 'invitation', 'member', 'user_added', 'join']
                const isLikelyInvitation = invitationKeywords.some((keyword) =>
                    eventType.toLowerCase().includes(keyword),
                )

                if (isLikelyInvitation) {
                    console.log(
                        '[ChatStore] [INVITATION DEBUG] Возможное приглашение обнаружено:',
                        {
                            eventType,
                            data: data?.data || data,
                            structureAnalysis: {
                                hasChat: !!(data?.data?.chat || data?.chat),
                                hasInvitedUser: !!(data?.data?.invited_user || data?.invited_user),
                                hasCreatedBy: !!(data?.data?.created_by || data?.created_by),
                                hasId: !!(data?.data?.id || data?.id),
                            },
                        },
                    )
                }
            }

            switch (eventType) {
                case 'message':
                case 'new_message':
                    const messageData = data?.data?.message || data.message || data.object || data
                    const chatId = data?.data?.chat_id || data.chat_id
                    if (messageData && chatId) {
                        this.handleNewMessage(messageData, chatId)
                    }
                    break

                case 'chat_updated':
                    const chatData = data?.data?.chat || data.chat || data.object || data
                    this.handleChatUpdated(chatData)
                    break

                case 'reaction_added':
                case 'reaction_removed':
                case 'new_reaction':
                case 'reaction_update':
                case 'reaction_changed':
                    this.handleReactionUpdate(data)
                    break

                case 'member_added':
                case 'member_removed':
                    console.log('[ChatStore] Обрабатываем изменение участников:', data)
                    this.handleMembershipUpdate(data)
                    break

                // РАСШИРЯЕМ: Добавляем больше возможных типов приглашений
                case 'new_invite':
                case 'invitation_created':
                case 'chat_invitation':
                case 'user_invited':
                case 'invite_created':
                case 'invitation':
                case 'member_invited':
                case 'user_added_to_chat':
                case 'invitation_sent':
                    console.log(
                        '[ChatStore] Обнаружено приглашение - передаем в handleNewInvitation',
                    )
                    this.handleNewInvitation(data)
                    break

                case 'chat_readed':
                    console.log('[ChatStore] Получено событие прочтения чата:', data?.data || data)
                    // Обрабатываем событие прочтения, если нужно
                    break

                default:
                    console.log('[ChatStore] Неизвестный тип события:', eventType)

                    // Улучшенная fallback логика
                    if (data?.id && data?.content !== undefined) {
                        console.log('[ChatStore] Fallback: обрабатываем как новое сообщение')
                        this.handleNewMessage(data, data.chat_id)
                    } else if (
                        data?.message_id &&
                        (data?.reaction_type_id || data?.reaction_type)
                    ) {
                        console.log('[ChatStore] Fallback: обрабатываем как реакцию')
                        this.handleReactionUpdate(data)
                    } else {
                        // УЛУЧШАЕМ: Расширенная проверка на приглашения
                        const possibleInvitation = data?.data || data
                        const hasInvitationSignature =
                            (possibleInvitation?.chat &&
                                (possibleInvitation?.invited_user ||
                                    possibleInvitation?.created_by)) ||
                            (possibleInvitation?.user_ids && possibleInvitation?.chat_id) ||
                            (possibleInvitation?.members && possibleInvitation?.action === 'added')

                        if (hasInvitationSignature) {
                            console.log(
                                '[ChatStore] Fallback: похоже на приглашение без правильного event_type',
                            )
                            console.log(
                                '[ChatStore] Структура данных приглашения:',
                                possibleInvitation,
                            )
                            this.handleNewInvitation(data)
                        } else {
                            console.warn('[ChatStore] Не удалось обработать WebSocket сообщение:', {
                                eventType,
                                data,
                                analyzed: {
                                    hasId: !!data?.id,
                                    hasContent: !!data?.content,
                                    hasMessageId: !!data?.message_id,
                                    hasChat: !!(data?.chat || data?.data?.chat),
                                    hasInvitedUser: !!(
                                        data?.invited_user || data?.data?.invited_user
                                    ),
                                    hasCreatedBy: !!(data?.created_by || data?.data?.created_by),
                                },
                            })
                        }
                    }
                    break
            }
        },

        // Инициализирует чаты только один раз для предотвращения дублирования запросов
        async initializeOnce(): Promise<void> {
            console.log('[ChatStore] initializeOnce вызван, состояние:', {
                isInitialized: this.isInitialized,
                isInitializing: this.isInitializing,
            })

            // Если уже инициализировано или идет инициализация - выходим
            if (this.isInitialized || this.isInitializing) {
                console.log('[ChatStore] Инициализация пропущена - уже выполнена или выполняется')
                return
            }

            this.isInitializing = true

            try {
                await this.fetchChats()

                // Загружаем приглашения после загрузки чатов (с обработкой ошибок)
                try {
                    await this.fetchInvitations()
                } catch (invitationError) {
                    console.warn('[ChatStore] Не удалось загрузить приглашения:', invitationError)
                }

                this.isInitialized = true
                console.log('[ChatStore] Инициализация завершена успешно')
            } catch (error) {
                console.error('[ChatStore] Ошибка инициализации:', error)
                // Не устанавливаем isInitialized в true при ошибке
            } finally {
                this.isInitializing = false
            }
        },

        // Сбрасывает состояние инициализации (например, при логауте)
        resetInitialization(): void {
            this.isInitialized = false
            this.isInitializing = false
            this.isSubscribedToUserChannel = false // Сбрасываем флаг подписки
            this.chats = []
            this.currentChat = null
            this.messages = []
            this.searchResults = null
            this.invitations = []
            this.isLoadingMessages = false
            this.isLoadingChats = false
            globalUnreadMessages.resetUnread()
        },

        // Загружает список чатов. Управляет глобальным индикатором загрузки, логирует ошибки
        async fetchChats(): Promise<void> {
            const fb = useFeedbackStore()
            fb.isGlobalLoading = true
            this.isLoadingChats = true

            try {
                const res = await axios.get(`${BASE_URL}/api/chat/chat/`)
                const chatsData = res.data?.results ?? res.data

                // Проверяем что получили массив
                if (Array.isArray(chatsData)) {
                    // Сортируем чаты по времени последнего сообщения
                    this.chats = sortChatsByLastMessage(chatsData)
                } else {
                    this.chats = []
                }

                // Загружаем счетчики непрочитанных сообщений (с обработкой ошибок)
                await this.fetchUnreadCounts()

                // Обновляем счетчик в заголовке после загрузки чатов
                this.updateTitleUnreadCount()

                // Проверяем состояние подключения к Centrifuge
                const centrifuge = useCentrifugeStore()
                console.log('[ChatStore] Состояние Centrifuge:', centrifuge.diagnostics())

                // Если Centrifuge не подключен, пытаемся инициализировать
                if (!centrifuge.connected) {
                    console.log('[ChatStore] Centrifuge не подключен, инициализируем...')
                    try {
                        await centrifuge.initCentrifuge()
                        // Ждем немного после инициализации
                        await new Promise((resolve) => setTimeout(resolve, 1000))
                        console.log(
                            '[ChatStore] Состояние Centrifuge после инициализации:',
                            centrifuge.diagnostics(),
                        )
                    } catch (error) {
                        console.error('[ChatStore] Ошибка инициализации Centrifuge:', error)
                    }
                } else {
                    console.log('[ChatStore] Centrifuge уже подключен')
                }

                // Подписываемся на единый канал пользователя для получения уведомлений о всех чатах
                this.subscribeToUserChannel()

                // Дополнительная проверка подписки через небольшую задержку
                setTimeout(() => {
                    const diagnostics = centrifuge.diagnostics()
                    console.log('[ChatStore] Проверка подписки через 2 секунды:', {
                        connected: diagnostics.connected,
                        subscriptions: diagnostics.subscriptions,
                        isSubscribedToUserChannel: this.isSubscribedToUserChannel,
                        userUuid: this.getCurrentUserUuid(),
                    })
                }, 2000)
            } catch (error) {
                // Устанавливаем пустой массив при ошибке
                this.chats = []

                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось загрузить чаты',
                    time: 7000,
                })

                // НЕ выбрасываем ошибку дальше, чтобы не ломать приложение
            } finally {
                fb.isGlobalLoading = false
                this.isLoadingChats = false
            }
        },

        // Создаёт диалог с пользователем. Возвращает существующий если уже есть
        async createDialog(userId: string): Promise<IChat> {
            console.log('chatStore.createDialog вызван с userId:', userId)
            try {
                console.log('chatStore.createDialog отправляем запрос к API...')
                const res = await axios.post(`${BASE_URL}/api/chat/chat/dialog/`, {
                    user_id: userId,
                })
                console.log('chatStore.createDialog ответ от API:', res.data)

                // В зависимости от ответа API может вернуть объект chat или напрямую данные чата
                const chat = res.data.chat || res.data

                // Проверяем, есть ли чат уже в списке
                const existingChatIndex = this.chats.findIndex((c) => c.id === chat.id)
                if (existingChatIndex === -1) {
                    // Если чата нет в списке, добавляем его
                    this.chats.unshift(chat)
                    // Пересортируем список
                    this.chats = sortChatsByLastMessage(this.chats)

                    useFeedbackStore().showToast({
                        type: 'success',
                        title: 'Успешно',
                        message: 'Диалог открыт',
                        time: 3000,
                    })
                } else {
                    // Если чат уже есть, обновляем его данные
                    this.chats.splice(existingChatIndex, 1, chat)
                    // Пересортируем список
                    this.chats = sortChatsByLastMessage(this.chats)
                }

                this.searchResults = null
                return chat
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось создать диалог',
                    time: 7000,
                })
                throw error
            }
        },

        // Создаёт групповой чат. Возвращает созданный объект и добавляет его в начало списка
        async createGroup(payload: {
            title: string
            description?: string
            icon?: File | null
        }): Promise<IChat> {
            try {
                const form = new FormData()
                form.append('title', payload.title || '')
                if (payload.description) form.append('description', payload.description)
                if (payload.icon) form.append('icon', payload.icon)

                const res = await axios.post(`${BASE_URL}/api/chat/chat/group/`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const chat = (res.data?.results ?? res.data) as IChat

                // Добавляем новый чат и пересортируем список
                this.chats.unshift(chat)
                this.chats = sortChatsByLastMessage(this.chats)

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Создано',
                    message: 'Группа успешно создана',
                    time: 3000,
                })
                return chat
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось создать группу',
                    time: 7000,
                })
                throw error
            }
        },

        // Создаёт канал. Возвращает созданный объект и добавляет его в начало списка
        async createChannel(payload: {
            title: string
            description?: string
            icon?: File | null
        }): Promise<IChat> {
            try {
                const form = new FormData()
                form.append('title', payload.title || '')
                if (payload.description) form.append('description', payload.description)
                if (payload.icon) form.append('icon', payload.icon)

                const res = await axios.post(`${BASE_URL}/api/chat/chat/channel/`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const chat = (res.data?.results ?? res.data) as IChat

                // Добавляем новый чат и пересортируем список
                this.chats.unshift(chat)
                this.chats = sortChatsByLastMessage(this.chats)

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Создано',
                    message: 'Канал успешно создан',
                    time: 3000,
                })
                return chat
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось создать канал',
                    time: 7000,
                })
                throw error
            }
        },

        // Объединенный метод создания чата (для совместимости с существующим кодом)
        async createChat(payload: {
            type: 'group' | 'channel'
            title: string
            description?: string
            icon?: File | null
        }): Promise<IChat> {
            if (payload.type === 'group') {
                return await this.createGroup(payload)
            } else if (payload.type === 'channel') {
                return await this.createChannel(payload)
            } else {
                throw new Error(`Unsupported chat type: ${payload.type}`)
            }
        },

        // Получает информацию о конкретном чате
        async fetchChat(chatId: number): Promise<IChat> {
            try {
                const res = await axios.get(`${BASE_URL}/api/chat/chat/${chatId}/`)
                return (res.data?.results ?? res.data) as IChat
            } catch (error) {
                console.error(`[ChatStore] Ошибка при загрузке чата ${chatId}:`, error)

                // Если чат не найден (404), показываем пользователю уведомление
                if (error?.response?.status === 404) {
                    useFeedbackStore().showToast({
                        type: 'error',
                        title: 'Чат не найден',
                        message: 'Запрашиваемый чат не существует или был удален',
                        time: 5000,
                    })
                }

                throw error
            }
        },

        // Обновляет информацию о чате (полное обновление)
        async updateChat(chatId: number, payload: IChatUpdatePayload): Promise<IChat> {
            try {
                const form = new FormData()

                // Добавляем только обновляемые поля
                if (payload.title !== undefined) form.append('title', payload.title)
                if (payload.description !== undefined)
                    form.append('description', payload.description)
                if (payload.icon !== undefined) {
                    if (payload.icon === null) {
                        form.append('icon', '')
                    } else if (typeof payload.icon === 'object' && payload.icon instanceof File) {
                        form.append('icon', payload.icon)
                    } else if (typeof payload.icon === 'string') {
                        form.append('icon', payload.icon)
                    }
                }

                const res = await axios.put(`${BASE_URL}/api/chat/chat/${chatId}/`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const updatedChat = (res.data?.results ?? res.data) as IChat

                // Обновляем чат в списке
                const chatIndex = this.chats.findIndex((chat) => chat.id === chatId)
                if (chatIndex !== -1) {
                    this.chats.splice(chatIndex, 1, updatedChat)
                    // Пересортируем список после обновления
                    this.chats = sortChatsByLastMessage(this.chats)
                }

                // Обновляем текущий чат, если это он
                if (this.currentChat?.id === chatId) {
                    this.currentChat = updatedChat
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Обновлено',
                    message: 'Чат успешно обновлен',
                    time: 3000,
                })

                return updatedChat
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось обновить чат',
                    time: 7000,
                })
                throw error
            }
        },

        // Частично обновляет информацию о чате (согласно документации)
        async partialUpdateChat(chatId: number, payload: IChatUpdatePayload): Promise<IChat> {
            try {
                const form = new FormData()

                // Добавляем только обновляемые поля
                if (payload.title !== undefined) form.append('title', payload.title)
                if (payload.description !== undefined)
                    form.append('description', payload.description)
                if (payload.icon !== undefined) {
                    if (payload.icon === null) {
                        form.append('icon', '')
                    } else if (typeof payload.icon === 'object' && payload.icon instanceof File) {
                        form.append('icon', payload.icon)
                    } else if (typeof payload.icon === 'string') {
                        form.append('icon', payload.icon)
                    }
                }

                const res = await axios.patch(`${BASE_URL}/api/chat/chat/${chatId}/`, form, {
                    headers: { 'Content-Type': 'multipart/form-data' },
                })
                const updatedChat = (res.data?.results ?? res.data) as IChat

                // Обновляем чат в списке
                const chatIndex = this.chats.findIndex((chat) => chat.id === chatId)
                if (chatIndex !== -1) {
                    this.chats.splice(chatIndex, 1, updatedChat)
                    // Пересортируем список после обновления
                    this.chats = sortChatsByLastMessage(this.chats)
                }

                // Обновляем текущий чат, если это он
                if (this.currentChat?.id === chatId) {
                    this.currentChat = updatedChat
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Обновлено',
                    message: 'Чат успешно обновлен',
                    time: 3000,
                })

                return updatedChat
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось обновить чат',
                    time: 7000,
                })
                throw error
            }
        },

        // Удаляет чат (согласно документации)
        async deleteChat(chatId: number): Promise<void> {
            try {
                await axios.delete(`${BASE_URL}/api/chat/chat/${chatId}/`)

                // Удаляем чат из списка
                this.chats = this.chats.filter((chat) => chat.id !== chatId)

                // Если это был текущий чат, сбрасываем выбор
                if (this.currentChat?.id === chatId) {
                    this.currentChat = null
                    this.messages = []
                    try {
                        localStorage.removeItem('selectedChatId')
                    } catch (e) {
                        // Игнорируем ошибки localStorage
                    }
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Удалено',
                    message: 'Чат успешно удален',
                    time: 3000,
                })
            } catch (error) {
                let errorMessage = 'Не удалось удалить чат'
                if (error?.response?.status === 403) {
                    errorMessage = 'У вас нет прав для удаления этого чата'
                } else if (error?.response?.status === 404) {
                    errorMessage = 'Чат не найден'
                    // Удаляем из локального списка если чат уже не существует
                    this.chats = this.chats.filter((chat) => chat.id !== chatId)
                }

                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: errorMessage,
                    time: 7000,
                })
                throw error
            }
        },

        // Добавляет участников в чат (отправляет приглашения)
        async addMembersToChat(chatId: number, userIds: string[]): Promise<void> {
            console.log('[ChatStore] Отправляем приглашения:', { chatId, userIds })
            console.log('[ChatStore] Текущий пользователь UUID:', this.getCurrentUserUuid())
            console.log(
                '[ChatStore] Состояние Centrifuge при отправке:',
                useCentrifugeStore().diagnostics(),
            )

            try {
                const response = await axios.post(
                    `${BASE_URL}/api/chat/chat/${chatId}/add-members/`,
                    {
                        user_ids: userIds,
                    },
                )
                console.log('[ChatStore] Ответ сервера на отправку приглашений:', response.data)
                console.log('[ChatStore] Статус HTTP ответа:', response.status)
                console.log('[ChatStore] Заголовки ответа:', response.headers)

                // ДОБАВЛЯЕМ: Принудительно обновляем список приглашений через API
                console.log('[ChatStore] Принудительно обновляем приглашения через API...')
                setTimeout(async () => {
                    try {
                        await this.fetchInvitations()
                        console.log(
                            '[ChatStore] Приглашения обновлены принудительно:',
                            this.invitations.length,
                        )
                    } catch (error) {
                        console.warn(
                            '[ChatStore] Не удалось принудительно обновить приглашения:',
                            error,
                        )
                    }
                }, 1000)

                // ДОБАВЛЯЕМ: Дополнительное ожидание WebSocket сообщений
                console.log('[ChatStore] Ожидаем WebSocket сообщения о приглашениях...')
                let messageReceived = false

                // Устанавливаем временный обработчик для отслеживания входящих сообщений
                const originalHandler = this.handleCentrifugoMessage.bind(this)
                this.handleCentrifugoMessage = (data) => {
                    console.log('[ChatStore] [TEMP] Перехвачено WebSocket сообщение:', data)

                    // Проверяем, не является ли это приглашением
                    const eventType = data?.event_type || data?.event || data?.type
                    if (
                        eventType &&
                        (eventType.includes('invite') ||
                            eventType.includes('invitation') ||
                            eventType === 'user_invited' ||
                            eventType === 'member_added')
                    ) {
                        console.log('[ChatStore] [TEMP] Найдено сообщение о приглашении!')
                        messageReceived = true
                    }

                    // Вызываем оригинальный обработчик
                    return originalHandler(data)
                }

                // Восстанавливаем оригинальный обработчик через 10 секунд
                setTimeout(() => {
                    this.handleCentrifugoMessage = originalHandler
                    if (!messageReceived) {
                        console.warn(
                            '[ChatStore] WebSocket сообщение о приглашении НЕ было получено за 10 секунд',
                        )
                        console.log(
                            '[ChatStore] Возможно, сервер не отправляет WebSocket уведомления для приглашений',
                        )
                    }
                }, 10000)

                // Обновляем информацию о чате после добавления участников
                const updatedChat = await this.fetchChat(chatId)
                const chatIndex = this.chats.findIndex((chat) => chat.id === chatId)
                if (chatIndex !== -1) {
                    this.chats.splice(chatIndex, 1, updatedChat)
                    this.chats = sortChatsByLastMessage(this.chats)
                }

                if (this.currentChat?.id === chatId) {
                    this.currentChat = updatedChat
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Успешно',
                    message: 'Приглашения отправлены',
                    time: 3000,
                })
            } catch (error) {
                console.error('[ChatStore] Ошибка при отправке приглашений:', error)
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось пригласить участников',
                    time: 7000,
                })
                throw error
            }
        },

        // Удаляет участника из чата
        async removeMemberFromChat(chatId: number, userId: string): Promise<void> {
            try {
                await axios.delete(
                    `${BASE_URL}/api/chat/chat/${chatId}/remove-member/?user_id=${userId}`,
                )

                // Обновляем информацию о чате после удаления участника
                const updatedChat = await this.fetchChat(chatId)
                const chatIndex = this.chats.findIndex((chat) => chat.id === chatId)
                if (chatIndex !== -1) {
                    this.chats.splice(chatIndex, 1, updatedChat)
                    // Пересортируем список после обновления
                    this.chats = sortChatsByLastMessage(this.chats)
                }

                // Обновляем текущий чат, если это он
                if (this.currentChat?.id === chatId) {
                    this.currentChat = updatedChat
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Успешно',
                    message: 'Участник удален из чата',
                    time: 3000,
                })
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось удалить участника',
                    time: 7000,
                })
                throw error
            }
        },

        // Выполняет поиск чатов и предложений новых диалогов
        async searchChats(query: string, includePublic: boolean = true): Promise<ISearchResults> {
            if (!query.trim()) {
                this.searchResults = null
                return { chats: [], new_dialogs: [] }
            }

            this.isSearching = true
            try {
                const params = new URLSearchParams({
                    q: query.trim(),
                    ...(includePublic && { include_public: 'true' }),
                })

                const res = await axios.get(
                    `${BASE_URL}/api/chat/chat/search/?${params.toString()}`,
                )

                this.searchResults = res.data
                return res.data
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось выполнить поиск',
                    time: 7000,
                })
                throw error
            } finally {
                this.isSearching = false
            }
        },

        // Создаёт или возвращает существующий личный диалог с выбранным сотрудником
        async createDirectChat(employeeId: string): Promise<IChat> {
            return await this.createDialog(employeeId)
        },

        // Находит или создает диалог с пользователем
        async findOrCreateDirectChat(userId: string): Promise<IChat> {
            console.log('chatStore.findOrCreateDirectChat вызван с userId:', userId)
            try {
                const result = await this.createDialog(userId)
                console.log('chatStore.findOrCreateDirectChat результат:', result)
                return result
            } catch (error) {
                console.error('chatStore.findOrCreateDirectChat ошибка:', error)
                throw error
            }
        },

        // Получает счетчики непрочитанных сообщений для всех чатов
        async fetchUnreadCounts(): Promise<void> {
            try {
                // Используем GET для получения счетчиков непрочитанных сообщений
                const res = await axios.get(`${BASE_URL}/api/chat/chat/unread-counts/`)
                const unreadData = res.data?.results ?? res.data

                // Проверяем формат ответа - может быть массив объектов или объект с ключами chat_id
                let unreadCounts: { chat_id: number; unread_count: number }[] = []

                if (Array.isArray(unreadData)) {
                    unreadCounts = unreadData
                } else if (unreadData && typeof unreadData === 'object') {
                    // Конвертируем объект в массив, если пришёл в формате { "chat_id": count }
                    unreadCounts = Object.entries(unreadData).map(([chatId, count]) => ({
                        chat_id: parseInt(chatId, 10),
                        unread_count: Number(count),
                    }))
                }

                // Обновляем счетчики в чатах
                unreadCounts.forEach((item) => {
                    const chatIndex = this.chats.findIndex((c) => c.id === item.chat_id)
                    if (chatIndex !== -1) {
                        const updatedChats = [...this.chats]
                        updatedChats[chatIndex] = {
                            ...updatedChats[chatIndex],
                            unread_count: item.unread_count,
                        }
                        this.chats = updatedChats
                    }
                })
            } catch (error) {
                // API может возвращать 404 если не реализован - инициализируем счетчики нулями

                // Инициализируем все чаты с нулевыми счетчиками
                const updatedChats = this.chats.map((chat) => ({
                    ...chat,
                    unread_count: chat.unread_count ?? 0,
                }))
                this.chats = updatedChats
            }
        },

        // Обновляет счетчик непрочитанных сообщений в заголовке страницы
        updateTitleUnreadCount(): void {
            const totalUnread = this.chats.reduce(
                (total, chat) => total + (chat.unread_count || 0),
                0,
            )

            // Устанавливаем счетчик через специальный метод
            globalUnreadMessages.setUnreadCount(totalUnread)
        },

        // Обрабатывает новое сообщение из WebSocket
        handleNewMessage(message: IMessage, chatId: number): void {
            const currentUserInfo = useCurrentUser(this.currentChat)
            const isFromCurrentUser = isMyMessage(
                message,
                String(currentUserInfo.id.value ?? ''),
                String(currentUserInfo.name.value ?? ''),
            )
            const isCurrentChat = this.currentChat?.id === chatId

            // Если это текущий чат - добавляем сообщение в список
            if (isCurrentChat) {
                // Проверяем что сообщение еще не добавлено
                const exists = this.messages.some((m) => m.id === message.id)
                if (!exists) {
                    this.messages.push(message)
                    this.messages.sort(compareMessagesAscending)
                }

                // Отмечаем как прочитанное
                setTimeout(() => {
                    this.markChatAsRead(chatId, message.id)
                }, 500)
            } else {
                // Если это другой чат - увеличиваем счетчик непрочитанных
                const chatIndex = this.chats.findIndex((c) => c.id === chatId)
                if (chatIndex !== -1) {
                    const oldCount = this.chats[chatIndex].unread_count || 0
                    const updatedChats = [...this.chats]
                    updatedChats[chatIndex] = {
                        ...updatedChats[chatIndex],
                        unread_count: oldCount + 1,
                        last_message_id: message.id,
                        last_message: message,
                    }
                    this.chats = updatedChats

                    // Пересортируем чаты после получения нового сообщения
                    this.chats = sortChatsByLastMessage(this.chats)

                    // Обновляем счетчик в заголовке после изменения счетчиков чатов
                    this.updateTitleUnreadCount()
                }
            }

            // Обновляем информацию о последнем сообщении в текущем чате тоже
            if (isCurrentChat && this.currentChat) {
                const chatIndex = this.chats.findIndex((c) => c.id === this.currentChat!.id)
                if (chatIndex !== -1) {
                    const updatedChat = {
                        ...this.chats[chatIndex],
                        last_message: message,
                        last_message_id: message.id,
                    }
                    this.chats.splice(chatIndex, 1, updatedChat)

                    // Пересортируем чаты после обновления последнего сообщения
                    this.chats = sortChatsByLastMessage(this.chats)
                }
            }

            // Для чужих сообщений воспроизводим звук
            if (!isFromCurrentUser) {
                // Воспроизводим звук для всех чужих сообщений (и в активном, и в неактивном чате)
                soundService.playNewMessageSound().catch(() => {
                    // Игнорируем ошибки воспроизведения звука
                })
            }
        },

        // Обрабатывает обновление информации о чате
        handleChatUpdated(chat: IChat): void {
            const chatIndex = this.chats.findIndex((c) => c.id === chat.id)
            if (chatIndex !== -1) {
                this.chats.splice(chatIndex, 1, chat)
                // Пересортируем список после обновления
                this.chats = sortChatsByLastMessage(this.chats)
            }

            // Обновляем текущий чат, если это он
            if (this.currentChat?.id === chat.id) {
                this.currentChat = chat
            }
        },

        // Обрабатывает обновление реакций
        handleReactionUpdate(data: any): void {
            // Извлекаем данные реакции из нового формата бэкенда
            const reactionData = data?.data || data
            const chatId = reactionData?.chat_id || data?.chat_id
            const messageId = reactionData?.message_id || data?.message_id
            const eventType = data?.event_type || data?.event || data?.type

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

            if (!chatId || !messageId) {
                return
            }

            // Если это текущий чат, обновляем локально
            if (this.currentChat && chatId === this.currentChat.id) {
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
                    this.messages = this.messages.map((msg) => ({ ...msg }))
                } else {
                    // Если локальное обновление не удалось, перезагружаем сообщения
                    this.fetchMessages(this.currentChat.id).catch(() => {})
                }
            }
        },

        // Локальное обновление реакции в сообщении
        updateMessageReactionLocally(
            messageId: number,
            reactionTypeId: number,
            userId: string,
            eventType: string,
            userName?: string,
            userAvatar?: string | null,
        ): boolean {
            try {
                const messageIndex = this.messages.findIndex((m) => m.id === messageId)
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

                    // Создаем новое сообщение с обновленными реакциями и временной меткой обновления
                    const updatedMessage = {
                        ...message,
                        reactions: filteredReactions,
                        message_reactions: filteredReactions,
                        // Добавляем временную метку последнего обновления для принудительного перерендера
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

                    // Создаем новое сообщение с обновленными реакциями и временной меткой обновления
                    const updatedMessage = {
                        ...message,
                        reactions: filteredReactions,
                        message_reactions: filteredReactions,
                        // Добавляем временную метку последнего обновления для принудительного перерендера
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

        // Обрабатывает изменения состава участников
        handleMembershipUpdate(data: any): void {
            // Перезагружаем список чатов для актуализации информации об участниках
            this.fetchChats()
        },

        // Обрабатывает новое приглашение в чат
        handleNewInvitation(data: any): void {
            console.log('[ChatStore] Получено новое приглашение через WebSocket:', data)
            console.log('[ChatStore] Структура данных приглашения:', {
                hasData: !!data?.data,
                hasDirectData: !!data,
                eventType: data?.event_type || data?.event || data?.type,
                keys: Object.keys(data || {}),
                dataKeys: Object.keys(data?.data || {}),
                timestamp: new Date().toISOString(),
            })

            try {
                // Извлекаем данные приглашения из WebSocket сообщения
                const invitationData = data?.data || data
                console.log('[ChatStore] Данные приглашения из WebSocket:', invitationData)

                if (!invitationData?.chat || !invitationData?.created_by) {
                    console.log(
                        '[ChatStore] Некорректные данные приглашения (отсутствует chat или created_by), пропускаем:',
                        invitationData,
                    )
                    return
                }

                // Получаем данные текущего пользователя если invited_user отсутствует
                const userStore = useUserStore()
                const currentUser = userStore.user
                const currentUserUuid = this.getCurrentUserUuid()

                // Проверяем наличие реального ID приглашения
                if (!invitationData.id) {
                    console.warn(
                        '[ChatStore] Приглашение без ID получено через WebSocket, пропускаем:',
                        invitationData,
                    )
                    return
                }

                const invitation: IChatInvitation = {
                    id: invitationData.id, // Используем только реальный ID от сервера
                    chat: invitationData.chat,
                    created_by: invitationData.created_by,
                    invited_user:
                        invitationData.invited_user ||
                        (currentUser
                            ? {
                                  id: currentUser.uuid || currentUser.id?.toString() || '',
                                  first_name: currentUser.first_name || '',
                                  last_name: currentUser.last_name || '',
                                  middle_name: currentUser.middle_name || '',
                                  phone_number: currentUser.phone_number || '',
                                  birth_date: currentUser.birth_date || null,
                              }
                            : undefined),
                    is_accepted: invitationData.is_accepted || false,
                    created_at: invitationData.created_at || new Date().toISOString(),
                }

                console.log('[ChatStore] Сформированное приглашение:', invitation)

                // Проверяем, что приглашение для текущего пользователя
                if (invitation.invited_user && invitation.invited_user.id !== currentUserUuid) {
                    console.log('[ChatStore] Приглашение не для текущего пользователя, пропускаем')
                    return
                }

                console.log('[ChatStore] Добавляем приглашение в список:', invitation)

                // Добавляем приглашение в список, если его еще нет
                // Проверяем дубликаты по chat.id и invited_user.id, так как id приглашения может быть временным
                const existingIndex = this.invitations.findIndex(
                    (inv) =>
                        inv.chat.id === invitation.chat.id &&
                        inv.invited_user?.id === invitation.invited_user?.id,
                )

                if (existingIndex !== -1) {
                    // Обновляем существующее приглашение
                    console.log('[ChatStore] Обновляем существующее приглашение')
                    this.invitations.splice(existingIndex, 1, invitation)
                } else {
                    // Добавляем новое приглашение в начало списка
                    console.log('[ChatStore] Добавляем новое приглашение')
                    this.invitations.unshift(invitation)
                }

                console.log('[ChatStore] Текущий список приглашений:', this.invitations)

                // Показываем уведомление
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'info',
                    title: 'Новое приглашение',
                    message: `${invitation.created_by.first_name} ${invitation.created_by.last_name} пригласил вас в "${invitation.chat.title}"`,
                    time: 5000,
                })
            } catch (error) {
                console.error('[ChatStore] Ошибка при обработке нового приглашения:', error)
                // Игнорируем ошибки обработки приглашений
            }
        },

        // Отмечает сообщения в чате как прочитанные (только локально)
        async markChatAsRead(chatId: number, lastMessageId?: number): Promise<void> {
            try {
                // Обновляем локальное состояние
                const chatIndex = this.chats.findIndex((c) => c.id === chatId)
                if (chatIndex !== -1) {
                    const updatedChats = [...this.chats]
                    updatedChats[chatIndex] = {
                        ...updatedChats[chatIndex],
                        unread_count: 0,
                        ...(lastMessageId && { last_read_message_id: lastMessageId }),
                    }
                    this.chats = updatedChats

                    // Обновляем счетчик в заголовке после изменения счетчиков чатов
                    this.updateTitleUnreadCount()
                }

                // Если это текущий чат, обновляем флаги прочитанности сообщений
                if (this.currentChat?.id === chatId) {
                    this.messages.forEach((message) => {
                        if (!lastMessageId || message.id <= lastMessageId) {
                            message.is_read = true
                        }
                    })
                }
            } catch (error) {
                // Критическая ошибка в логике
            }
        },

        // Открывает чат: получает актуальную информацию, грузит сообщения, типы реакций и подписывается на realtime-канал
        async openChat(chatOrId: IChat | number): Promise<void> {
            let chatId: number

            if (typeof chatOrId === 'number') {
                chatId = chatOrId
            } else {
                chatId = chatOrId.id
                // Если передан объект чата и он такой же как текущий - выходим
                if (this.currentChat?.id === chatId) {
                    console.log('[ChatStore] Чат уже открыт, пропускаем')
                    return
                }
            }

            // Если тот же чат уже открыт - выходим
            if (this.currentChat?.id === chatId) {
                console.log('[ChatStore] Чат уже открыт:', chatId)
                return
            }

            console.log('[ChatStore] Открываем чат:', chatId)

            // Остальной код остается без изменений...
            this.isLoadingMessages = true
            this.messages = []

            const loadingStartTime = Date.now()

            try {
                localStorage.setItem('selectedChatId', String(chatId))
            } catch (e) {
                // Игнорируем ошибки localStorage
            }

            try {
                // Получаем актуальную информацию о чате
                try {
                    const actualChat = await this.fetchChat(chatId)
                    this.currentChat = actualChat

                    const chatIndex = this.chats.findIndex((c) => c.id === chatId)
                    if (chatIndex !== -1) {
                        this.chats.splice(chatIndex, 1, actualChat)
                    }
                } catch (error) {
                    console.error(`[ChatStore] Ошибка получения чата ${chatId}:`, error)
                    if (error?.response?.status === 404) {
                        this.currentChat = null
                        try {
                            localStorage.removeItem('selectedChatId')
                        } catch (e) {}
                        return
                    }

                    if (typeof chatOrId !== 'number') {
                        this.currentChat = chatOrId
                    } else {
                        const chatFromList = this.chats.find((c) => c.id === chatId)
                        if (chatFromList) {
                            this.currentChat = chatFromList
                        } else {
                            this.currentChat = null
                            return
                        }
                    }
                }

                // Загружаем типы реакций только если их еще нет
                if (!this.reactionTypes.length) {
                    try {
                        await this.fetchReactionTypes()
                    } catch (error) {
                        console.warn('[ChatStore] Не удалось загрузить типы реакций:', error)
                    }
                }

                // Загружаем сообщения
                await this.fetchMessages(chatId)

                // Отмечаем как прочитанное
                if (this.messages.length > 0) {
                    try {
                        const lastMessage = this.messages[this.messages.length - 1]
                        await this.markChatAsRead(chatId, lastMessage.id)
                    } catch (error) {}
                } else {
                    await this.markChatAsRead(chatId)
                }
            } finally {
                const loadingElapsed = Date.now() - loadingStartTime
                const minimumSkeletonTime = 500

                if (loadingElapsed < minimumSkeletonTime) {
                    const remainingTime = minimumSkeletonTime - loadingElapsed
                    await new Promise((resolve) => setTimeout(resolve, remainingTime))
                }

                this.isLoadingMessages = false
            }
        },

        // Открывает чат только по ID (удобно для URL параметров и localStorage)
        async openChatById(chatId: number): Promise<void> {
            return await this.openChat(chatId)
        },

        // Загружает сообщения выбранного чата с сортировкой по времени
        async fetchMessages(chatId: number): Promise<void> {
            try {
                const res = await axios.get(`${BASE_URL}/api/chat/chat/${chatId}/message/`)
                const list = (res.data?.results ?? res.data) as IMessage[]

                // Используйте правильное реактивное присваивание
                const sortedMessages = [...list].sort(compareMessagesAscending)
                this.messages.length = 0
                this.messages.push(...sortedMessages)
            } catch (error) {
                // При ошибке 404 или другой ошибке - очищаем сообщения
                this.messages.length = 0

                // Не выбрасываем ошибку дальше, чтобы не ломать UI
            }
            // Убираем finally блок, который сбрасывал isLoadingMessages -
            // теперь это контролируется в openChat с минимальным временем показа
        },

        // Отправляет текстовое сообщение в текущий чат
        async sendMessage(content: string): Promise<IMessage> {
            if (!this.currentChat) throw new Error('Нет выбранного чата')
            this.isSending = true
            try {
                const res = await axios.post(
                    `${BASE_URL}/api/chat/chat/${this.currentChat.id}/message/`,
                    { content },
                )
                const msg = res.data as IMessage

                // Добавляем сообщение сразу, если оно еще не пришло через WebSocket
                const exists = this.messages.some((m) => m.id === msg.id)
                if (!exists) {
                    this.messages.push(msg)
                    this.messages.sort(compareMessagesAscending)
                }

                // Обновляем последнее сообщение в текущем чате и поднимаем чат в топ
                if (this.currentChat) {
                    const chatIndex = this.chats.findIndex((c) => c.id === this.currentChat!.id)
                    if (chatIndex !== -1) {
                        const updatedChat = {
                            ...this.chats[chatIndex],
                            last_message: msg,
                            last_message_id: msg.id,
                        }
                        this.chats.splice(chatIndex, 1, updatedChat)

                        // Пересортируем чаты чтобы отправленное сообщение подняло чат в топ
                        this.chats = sortChatsByLastMessage(this.chats)
                    }
                }

                return msg
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отправить сообщение',
                    time: 7000,
                })
                throw error
            } finally {
                this.isSending = false
            }
        },

        // Отправляет сообщение с файлами (как в Telegram)
        async sendMessageWithFiles(content: string, files: File[]): Promise<IMessage> {
            if (!this.currentChat) throw new Error('Нет выбранного чата')
            this.isSending = true
            try {
                const form = new FormData()
                form.append('content', content)

                // Добавляем все файлы в форму с параметром "files" как указано в API
                files.forEach((file) => {
                    form.append('files', file)
                })

                const res = await axios.post(
                    `${BASE_URL}/api/chat/chat/${this.currentChat.id}/message/`,
                    form,
                    {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    },
                )
                const msg = res.data as IMessage

                // Добавляем сообщение сразу, если оно еще не пришло через WebSocket
                const exists = this.messages.some((m) => m.id === msg.id)
                if (!exists) {
                    this.messages.push(msg)
                    this.messages.sort(compareMessagesAscending)
                }

                // Обновляем последнее сообщение в текущем чате и поднимаем чат в топ
                if (this.currentChat) {
                    const chatIndex = this.chats.findIndex((c) => c.id === this.currentChat!.id)
                    if (chatIndex !== -1) {
                        const updatedChat = {
                            ...this.chats[chatIndex],
                            last_message: msg,
                            last_message_id: msg.id,
                        }
                        this.chats.splice(chatIndex, 1, updatedChat)

                        // Пересортируем чаты чтобы отправленное сообщение подняло чат в топ
                        this.chats = sortChatsByLastMessage(this.chats)
                    }
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Отправлено',
                    message: `Сообщение с ${files.length} файлами отправлено`,
                    time: 3000,
                })

                return msg
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отправить сообщение с файлами',
                    time: 7000,
                })
                throw error
            } finally {
                this.isSending = false
            }
        },

        // Частично обновляет сообщение (PATCH)
        async updateMessage(chatId: number, messageId: number, content: string): Promise<IMessage> {
            try {
                const res = await axios.patch(
                    `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/`,
                    { content },
                )
                const updatedMessage = res.data as IMessage

                // Обновляем сообщение в локальном списке
                const messageIndex = this.messages.findIndex((m) => m.id === messageId)
                if (messageIndex !== -1) {
                    this.messages.splice(messageIndex, 1, updatedMessage)
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Обновлено',
                    message: 'Сообщение изменено',
                    time: 3000,
                })

                return updatedMessage
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось изменить сообщение',
                    time: 7000,
                })
                throw error
            }
        },

        // Полностью обновляет сообщение (PUT) - согласно документации
        async replaceMessage(
            chatId: number,
            messageId: number,
            content: string,
        ): Promise<IMessage> {
            try {
                const res = await axios.put(
                    `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/`,
                    { content },
                )
                const updatedMessage = res.data as IMessage

                // Обновляем сообщение в локальном списке
                const messageIndex = this.messages.findIndex((m) => m.id === messageId)
                if (messageIndex !== -1) {
                    this.messages.splice(messageIndex, 1, updatedMessage)
                }

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Обновлено',
                    message: 'Сообщение заменено',
                    time: 3000,
                })

                return updatedMessage
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось заменить сообщение',
                    time: 7000,
                })
                throw error
            }
        },

        // Удаляет сообщение
        async deleteMessage(chatId: number, messageId: number): Promise<void> {
            try {
                await axios.delete(`${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/`)

                // Удаляем сообщение из локального списка
                this.messages = this.messages.filter((m) => m.id !== messageId)

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Удалено',
                    message: 'Сообщение удалено',
                    time: 3000,
                })
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось удалить сообщение',
                    time: 7000,
                })
                throw error
            }
        },

        // Получает список пользователей, которые прочитали сообщение
        async fetchMessageReaders(chatId: number, messageId: number): Promise<any[]> {
            try {
                const res = await axios.get(
                    `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/readers/`,
                )
                return res.data?.results ?? res.data
            } catch (error) {
                return []
            }
        },

        // Загружает типы реакций
        async fetchReactionTypes(): Promise<void> {
            try {
                const res = await axios.get(`${BASE_URL}/api/chat/chat/reactions/types/`)
                this.reactionTypes = res.data as IReactionType[]
            } catch (error) {
                this.reactionTypes = [
                    { id: 1, name: 'Like', icon: '👍' },
                    { id: 2, name: 'Love', icon: '❤️' },
                    { id: 3, name: 'Laugh', icon: '😂' },
                    { id: 4, name: 'Wow', icon: '😮' },
                    { id: 5, name: 'Sad', icon: '😢' },
                    { id: 6, name: 'Angry', icon: '😠' },
                ] as IReactionType[]
            }
        },

        // Добавляет реакцию на сообщение
        async addReaction(messageId: number, reactionId: number): Promise<void> {
            if (!this.currentChat) return
            try {
                // ИСПРАВЛЕНО: Согласно документации, параметр реакции передается как "content", но логически должен быть reaction_type_id
                // Проверим оба варианта для совместимости
                await axios.post(
                    `${BASE_URL}/api/chat/chat/${this.currentChat.id}/message/${messageId}/reactions/`,
                    {
                        reaction_type_id: reactionId,
                        // Добавляем content для совместимости с документацией, если API его ожидает
                        content: reactionId.toString(),
                    },
                )
                // Убираем перезагрузку сообщений - реакции обновятся через WebSocket
            } catch (error) {
                // При ошибке все же перезагружаем для корректного состояния
                await this.fetchMessages(this.currentChat.id)
                throw error
            }
        },

        // Удаляет реакцию с сообщения
        async removeReaction(messageId: number): Promise<void> {
            if (!this.currentChat) return
            try {
                // Параметры не передаем - API автоматически удалит реакцию текущего пользователя
                await axios.delete(
                    `${BASE_URL}/api/chat/chat/${this.currentChat.id}/message/${messageId}/reactions/`,
                )
                // Убираем перезагрузку сообщений - реакции обновятся через WebSocket
            } catch (error) {
                // При ошибке все же перезагружаем для корректного состояния
                await this.fetchMessages(this.currentChat.id)
                throw error
            }
        },

        // Устанавливает эксклюзивную реакцию (удаляет старую и добавляет новую)
        async setExclusiveReaction(messageId: number, reactionId: number): Promise<void> {
            if (!this.currentChat) return
            try {
                // Сначала удаляем все мои реакции
                await this.clearMyReactions(messageId)
                // Затем добавляем новую
                await this.addReaction(messageId, reactionId)
            } catch (error) {
                throw error
            }
        },

        // Очищает все мои реакции с сообщения
        async clearMyReactions(messageId: number): Promise<void> {
            if (!this.currentChat) return
            try {
                // Используем тот же DELETE эндпоинт без параметров
                await axios.delete(
                    `${BASE_URL}/api/chat/chat/${this.currentChat.id}/message/${messageId}/reactions/`,
                )
                // Убираем перезагрузку сообщений - реакции обновятся через WebSocket
            } catch (error) {
                // Игнорируем ошибки при очистке (возможно реакции уже нет)
                // При ошибке все же перезагружаем для корректного состояния
                await this.fetchMessages(this.currentChat.id)
            }
        },

        // ============ ПРИГЛАШЕНИЯ В ЧАТЫ ============

        // Получает список приглашений в чаты
        async fetchInvitations(): Promise<void> {
            console.log('[ChatStore] Загружаем приглашения...')
            try {
                const res = await axios.get(`${BASE_URL}/api/chat/invite/`)
                const invitationsData = res.data?.results ?? res.data
                console.log('[ChatStore] Получены приглашения:', invitationsData)

                // Проверяем что получили массив и сохраняем в состояние
                if (Array.isArray(invitationsData)) {
                    // Получаем данные текущего пользователя
                    const userStore = useUserStore()
                    const currentUser = userStore.user

                    // Дополняем каждое приглашение полем invited_user если его нет
                    this.invitations = invitationsData.map((invitation) => {
                        // Если invited_user отсутствует, добавляем данные текущего пользователя
                        if (!invitation.invited_user && currentUser) {
                            return {
                                ...invitation,
                                invited_user: {
                                    id: currentUser.uuid || currentUser.id?.toString() || '',
                                    first_name: currentUser.first_name || '',
                                    last_name: currentUser.last_name || '',
                                    middle_name: currentUser.middle_name || '',
                                    phone_number: currentUser.phone_number || '',
                                    birth_date: currentUser.birth_date || null,
                                },
                            }
                        }
                        return invitation
                    })
                    console.log('[ChatStore] Обработанные приглашения:', this.invitations)
                } else {
                    console.log(
                        '[ChatStore] Получен не массив приглашений, устанавливаем пустой массив',
                    )
                    this.invitations = []
                }
            } catch (error) {
                console.error('[ChatStore] Ошибка при загрузке приглашений:', error)
                // При ошибке устанавливаем пустой массив
                this.invitations = []
            }
        },

        // Приглашает участников в чат (для обратной совместимости)
        // ПРИМЕЧАНИЕ: Теперь использует addMembersToChat с исправленным API эндпоинтом
        async inviteUsersToChat(chatId: number, userIds: string[]): Promise<void> {
            return await this.addMembersToChat(chatId, userIds)
        },

        // Принимает приглашение в чат
        async acceptInvitation(invitationId: number): Promise<void> {
            console.log('[ChatStore] acceptInvitation вызван с ID:', invitationId)
            try {
                const response = await axios.post(
                    `${BASE_URL}/api/chat/invite/${invitationId}/accept/`,
                )
                console.log('[ChatStore] acceptInvitation: ответ сервера:', response.data)

                // Удаляем приглашение из списка
                const beforeCount = this.invitations.length
                this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)
                const afterCount = this.invitations.length
                console.log(
                    '[ChatStore] acceptInvitation: приглашения до/после удаления:',
                    beforeCount,
                    '/',
                    afterCount,
                )

                // Обновляем список чатов после принятия приглашения
                await this.fetchChats()
                console.log('[ChatStore] acceptInvitation: список чатов обновлен')

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Успешно',
                    message: 'Приглашение принято',
                    time: 3000,
                })
            } catch (error) {
                console.error('[ChatStore] acceptInvitation: ошибка:', error)

                // Проверяем тип ошибки для более точных сообщений
                let errorMessage = 'Не удалось принять приглашение'
                if (error?.response?.status === 404) {
                    errorMessage = 'Приглашение не найдено или уже недействительно'
                    // Удаляем недействительное приглашение из списка
                    this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)
                } else if (error?.response?.status === 403) {
                    errorMessage = 'У вас нет прав для принятия этого приглашения'
                } else if (error?.response?.status === 400) {
                    errorMessage = 'Приглашение уже было принято или отклонено'
                    // Удаляем уже обработанное приглашение из списка
                    this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)
                }

                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: errorMessage,
                    time: 7000,
                })
                throw error
            }
        },

        // Отклоняет полученное приглашение
        async declineInvitation(invitationId: number): Promise<void> {
            console.log('[ChatStore] declineInvitation вызван с ID:', invitationId)
            try {
                // Используем правильный endpoint для отклонения приглашения
                const response = await axios.delete(
                    `${BASE_URL}/api/chat/invite/${invitationId}/decline/`,
                )
                console.log('[ChatStore] declineInvitation: ответ сервера:', response.data)

                // Удаляем приглашение из списка
                const beforeCount = this.invitations.length
                this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)
                const afterCount = this.invitations.length
                console.log(
                    '[ChatStore] declineInvitation: приглашения до/после удаления:',
                    beforeCount,
                    '/',
                    afterCount,
                )

                useFeedbackStore().showToast({
                    type: 'info',
                    title: 'Отклонено',
                    message: 'Приглашение отклонено',
                    time: 3000,
                })
            } catch (error) {
                console.error('[ChatStore] declineInvitation: ошибка:', error)

                // Проверяем тип ошибки для более точных сообщений
                let errorMessage = 'Не удалось отклонить приглашение'
                if (error?.response?.status === 404) {
                    errorMessage = 'Приглашение не найдено или уже недействительно'
                    // Удаляем недействительное приглашение из списка
                    this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)
                } else if (error?.response?.status === 403) {
                    errorMessage = 'У вас нет прав для отклонения этого приглашения'
                } else if (error?.response?.status === 400) {
                    errorMessage = 'Приглашение уже было принято или отклонено'
                    // Удаляем уже обработанное приглашение из списка
                    this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)
                }

                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: errorMessage,
                    time: 7000,
                })
                throw error
            }
        },

        // Удаляет отправленное приглашение
        async removeInvitation(invitationId: number): Promise<void> {
            try {
                await axios.delete(`${BASE_URL}/api/chat/invite/${invitationId}/remove/`)

                useFeedbackStore().showToast({
                    type: 'info',
                    title: 'Удалено',
                    message: 'Приглашение отозвано',
                    time: 3000,
                })
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отозвать приглашение',
                    time: 7000,
                })
                throw error
            }
        },

        // ============ ДИАГНОСТИКА И ОТЛАДКА ============

        // Тестирует отправку сообщения в WebSocket (для отладки)
        testWebSocketMessage(message: any): void {
            console.log('[ChatStore] Тестируем обработку WebSocket сообщения:', message)
            this.handleCentrifugoMessage(message)
        },

        // Имитирует получение приглашения для тестирования
        simulateInvitation(chatTitle: string = 'Тестовый чат'): void {
            const testInvitation = {
                event_type: 'new_invite',
                data: {
                    id: Date.now(), // Временный ID для теста
                    chat: {
                        id: 999,
                        title: chatTitle,
                        type: 'group',
                        icon: null,
                    },
                    created_by: {
                        id: 'test-user',
                        first_name: 'Тестовый',
                        last_name: 'Пользователь',
                        middle_name: '',
                        phone_number: '+1234567890',
                        birth_date: null,
                    },
                    invited_user: null, // Будет заполнено из текущего пользователя
                    is_accepted: false,
                    created_at: new Date().toISOString(),
                },
            }

            console.log('[ChatStore] Имитируем получение приглашения:', testInvitation)
            this.handleCentrifugoMessage(testInvitation)
        },

        // Принудительно переподключается к Centrifuge и переподписывается на канал
        async reconnectToWebSocket(): Promise<void> {
            console.log('[ChatStore] Принудительное переподключение к WebSocket...')

            try {
                const centrifuge = useCentrifugeStore()

                // Сбрасываем флаг подписки
                this.isSubscribedToUserChannel = false

                // Отключаемся и переподключаемся
                if (centrifuge.client) {
                    centrifuge.client.disconnect()
                }

                // Сбрасываем состояние подключения
                centrifuge.resetConnectionState()

                // Ждем немного перед переподключением
                await new Promise((resolve) => setTimeout(resolve, 1000))

                // Переподключаемся
                await centrifuge.initCentrifuge()

                // Ждем установления соединения
                await new Promise((resolve) => setTimeout(resolve, 2000))

                // Переподписываемся на канал
                this.subscribeToUserChannel()

                console.log(
                    '[ChatStore] Переподключение завершено, состояние:',
                    centrifuge.diagnostics(),
                )

                useFeedbackStore().showToast({
                    type: 'info',
                    title: 'Переподключение',
                    message: 'WebSocket соединение переустановлено',
                    time: 3000,
                })
            } catch (error) {
                console.error('[ChatStore] Ошибка при переподключении:', error)
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось переподключиться к серверу',
                    time: 7000,
                })
            }
        },

        // Проверяет состояние WebSocket соединения
        checkWebSocketConnection(): any {
            const centrifuge = useCentrifugeStore()
            const diagnostics = centrifuge.diagnostics()
            const userUuid = this.getCurrentUserUuid()
            const channelName = userUuid ? `chats:user#${userUuid}` : null

            return {
                connected: diagnostics.connected,
                connecting: diagnostics.connecting,
                connectionLost: diagnostics.connectionLost,
                hasClient: diagnostics.hasClient,
                subscriptions: diagnostics.subscriptions,
                handlers: diagnostics.handlers,
                isSubscribedToUserChannel: this.isSubscribedToUserChannel,
                userUuid,
                channelName,
                subscribedToUserChannel: channelName
                    ? diagnostics.subscriptions.includes(channelName)
                    : false,
                lastLog: diagnostics.lastLog,
                logsCount: diagnostics.logsCount,
                timestamp: new Date().toISOString(),
            }
        },

        // ============ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ============

        // Загружает файл-вложение для указанного сообщения
        async uploadAttachment(messageId: number, file: File): Promise<void> {
            if (!this.currentChat) throw new Error('Нет выбранного чата')

            try {
                const form = new FormData()
                form.append('file', file)

                await axios.post(
                    `${BASE_URL}/api/chat/chat/${this.currentChat.id}/message/${messageId}/attachments/`,
                    form,
                    {
                        headers: { 'Content-Type': 'multipart/form-data' },
                    },
                )

                // Перезагружаем сообщения после загрузки вложения
                await this.fetchMessages(this.currentChat.id)

                useFeedbackStore().showToast({
                    type: 'success',
                    title: 'Загружено',
                    message: 'Файл успешно загружен',
                    time: 3000,
                })
            } catch (error) {
                useFeedbackStore().showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось загрузить файл',
                    time: 7000,
                })
                throw error
            }
        },
    },

    getters: {
        // Общее количество непрочитанных сообщений
        totalUnreadCount: (state) =>
            state.chats.reduce((total, chat) => total + (chat.unread_count || 0), 0),

        // Количество непрочитанных сообщений в заголовке
        titleUnreadCount: () => globalUnreadMessages.unreadCount.value,

        // Текущий пользователь UUID/ID
        currentUserId(): string | null {
            const userStore = useUserStore()
            return userStore.user?.uuid || userStore.user?.id?.toString() || null
        },

        // Фильтрованные чаты по типу (с сохранением сортировки)
        chatsByType: (state) => (type: string) => {
            const filteredChats = (() => {
                if (type === 'all') return state.chats
                if (type === 'direct')
                    return state.chats.filter(
                        (chat) => chat.type === 'direct' || chat.type === 'dialog',
                    )
                return state.chats.filter((chat) => chat.type === type)
            })()

            // Возвращаем отфильтрованные чаты в том же порядке (уже отсортированные)
            return filteredChats
        },

        // Непрочитанные чаты (с сохранением сортировки)
        unreadChats: (state) => state.chats.filter((chat) => (chat.unread_count || 0) > 0),

        // Активные чаты (с недавней активностью, с сохранением сортировки)
        activeChats: (state) => state.chats.filter((chat) => chat.last_message_id),
    },
})

export const useChatStore = chatStore

// Экспортируем функции для отладки в development режиме
if (import.meta.env.DEV && typeof window !== 'undefined') {
    // Делаем доступными функции отладки в глобальной области
    ;(window as any).chatDebug = {
        store: chatStore,
        checkConnection: () => chatStore().checkWebSocketConnection(),
        reconnect: () => chatStore().reconnectToWebSocket(),
        simulateInvitation: (title?: string) => chatStore().simulateInvitation(title),
        testMessage: (message: any) => chatStore().testWebSocketMessage(message),
        diagnostics: () => {
            const store = chatStore()
            const centrifuge = useCentrifugeStore()
            return {
                chat: store.checkWebSocketConnection(),
                centrifuge: centrifuge.diagnostics(),
                invitations: store.invitations,
                chats: store.chats.length,
                currentChat: store.currentChat?.id || null,
            }
        },
    }

    console.log('[ChatStore] Отладочные функции доступны в window.chatDebug')
    console.log('Доступные команды:')
    console.log('- window.chatDebug.checkConnection() - проверить соединение')
    console.log('- window.chatDebug.reconnect() - переподключиться')
    console.log('- window.chatDebug.simulateInvitation("Название чата") - симулировать приглашение')
    console.log('- window.chatDebug.diagnostics() - полная диагностика')
}
