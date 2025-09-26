import { computed, onMounted, onUnmounted, ref, watch, shallowRef } from 'vue'
import { useChatModule } from '@/refactoring/modules/chat/composables/useChatModule'
import { useCurrentUser } from '@/refactoring/modules/chat/composables/useCurrentUser'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import { toApiDate, formatDateOnly } from '@/refactoring/utils/formatters'

import type {
    IChat,
    IMessage,
    IEmployee,
    IChatInvitation,
    MediaQueryMethods,
    MobileViewType,
    IChatUpdatePayload,
} from '@/refactoring/modules/chat/types/IChat'

export interface ChatLogicOptions {
    /** ID пользователя для создания диалога при инициализации */
    userId?: string
    /** ID чата для открытия при инициализации */
    initialChatId?: number | null
    /** ID пользователя для создания диалога при инициализации */
    initialUserId?: string | null
    /** Селектор контейнера сообщений для скролла */
    messagesContainerSelector?: string
    /** Колбэк при открытии чата */
    onChatOpen?: (chat: IChat) => void
}

interface MessageGroup {
    key: string
    label: string
    items: IMessage[]
}

export function useChatLogic(options: ChatLogicOptions = {}) {
    const chat = useChatModule()
    const currentUser = useCurrentUser(chat.currentChat)

    // Состояние компонента
    const messagesContainer = shallowRef<HTMLElement | null>(null)
    const autoScroll = ref(true)
    const BOTTOM_THRESHOLD_PX = 32

    // Мобильная адаптация
    const isMobile = ref(false)
    const mobileView = ref<MobileViewType>('list')
    let mediaQueryList: (MediaQueryList & MediaQueryMethods) | null = null

    const updateIsMobile = () => {
        if (!mediaQueryList) return
        isMobile.value = mediaQueryList.matches
    }

    // Группировка сообщений по дате с оптимизацией
    const todayKey = toApiDate(new Date())

    const groupedMessages = computed<MessageGroup[]>(() => {
        const items = chat.messages.value
        if (!items?.length) return []

        const groups = new Map<string, MessageGroup>()

        for (const message of items) {
            const key = toApiDate(message?.created_at) || 'unknown'
            if (!groups.has(key)) {
                const isToday = key === todayKey
                groups.set(key, {
                    key,
                    label: isToday ? 'Сегодня' : formatDateOnly(key),
                    items: [],
                })
            }
            groups.get(key)!.items.push(message)
        }

        return Array.from(groups.entries())
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([, value]) => value)
    })

    // Управление скроллом
    const scrollToBottom = () => {
        if (!messagesContainer.value) return
        requestAnimationFrame(() => {
            const el = messagesContainer.value!
            el.scrollTop = el.scrollHeight
        })
    }

    const handleScroll = () => {
        const el = messagesContainer.value
        if (!el) return
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
        autoScroll.value = distanceFromBottom <= BOTTOM_THRESHOLD_PX
    }

    // Обработчики для чата
    const openChatFromList = async (chatToOpen: IChat) => {
        await chat.openChat(chatToOpen)
        if (isMobile.value) mobileView.value = 'chat'
        options.onChatOpen?.(chatToOpen)
    }

    const performSearch = async (query: string) => {
        await chat.searchChats(query)
    }

    const clearSearch = () => {
        chat.clearSearch()
    }

    const createNewDialog = async (employee: IEmployee) => {
        try {
            const newChat = await chat.createDialog(employee.id)
            await chat.openChat(newChat)
            if (isMobile.value) mobileView.value = 'chat'
            options.onChatOpen?.(newChat)
        } catch (error) {
            // Ошибка создания диалога
        }
    }

    const sendMessage = async (content: string, files?: File[]) => {
        if (!chat.currentChat.value) return

        if (files && files.length > 0) {
            // Отправляем сообщение с файлами
            await chat.sendMessageWithFiles(chat.currentChat.value.id, content, files)
        } else {
            // Отправляем обычное текстовое сообщение
            await chat.sendMessage(chat.currentChat.value.id, content)
        }
    }

    // Создание чата с поддержкой новых типов
    const createChat = async (payload: {
        type: 'group' | 'channel'
        title: string
        description?: string
        icon?: File | null
        addMembersImmediately?: boolean
    }) => {
        let newChat: IChat

        // Используем соответствующий метод в зависимости от типа
        if (payload.type === 'group') {
            newChat = await chat.createGroup({
                title: payload.title,
                description: payload.description,
                icon: payload.icon,
            })
        } else if (payload.type === 'channel') {
            newChat = await chat.createChannel({
                title: payload.title,
                description: payload.description,
                icon: payload.icon,
            })
        } else {
            throw new Error(`Unsupported chat type: ${payload.type}`)
        }

        await chat.openChat(newChat)
        options.onChatOpen?.(newChat)

        // Возвращаем объект с чатом и флагом для немедленного добавления участников
        return {
            chat: newChat,
            shouldInviteMembers: payload.addMembersImmediately || false,
        }
    }

    const addMembersToChat = async (userIds: string[]) => {
        if (!chat.currentChat.value) return

        try {
            await chat.addMembersToChat(chat.currentChat.value.id, userIds)
        } catch (error) {
            // Ошибка добавления участников
        }
    }

    // Для обратной совместимости
    const inviteUsersToChat = addMembersToChat

    // Управление участниками чата
    const removeMemberFromChat = async (userId: string) => {
        if (!chat.currentChat.value) return

        try {
            await chat.removeMemberFromChat(chat.currentChat.value.id, userId)
        } catch (error) {
            // Ошибка удаления участника
        }
    }

    // Обновление информации о чате
    const updateChatInfo = async (payload: IChatUpdatePayload) => {
        if (!chat.currentChat.value) return

        try {
            const updatedChat = await chat.updateChat(chat.currentChat.value.id, payload)
            return updatedChat
        } catch (error) {
            // Ошибка обновления чата
            throw error
        }
    }

    const changeReaction = async (
        messageId: number,
        reactionId: number,
        prevReactionId: number | null,
    ) => {
        // Если пользователь кликает на ту же реакцию - удаляем её
        if (prevReactionId && prevReactionId === reactionId) {
            await chat.removeReaction(messageId)
            return
        }

        // Если у пользователя уже есть реакция - используем эксклюзивную установку
        if (prevReactionId !== null) {
            await chat.setExclusiveReaction(messageId, reactionId)
        } else {
            await chat.addReaction(messageId, reactionId)
        }
    }

    const removeMyReaction = async (messageId: number, prevReactionId: number | null) => {
        await chat.removeReaction(messageId)
    }

    // Управление приглашениями
    const acceptInvitation = async (invitationOrId: number | IChatInvitation) => {
        try {
            const invitationId =
                typeof invitationOrId === 'number' ? invitationOrId : invitationOrId.id
            if (!invitationId || invitationId <= 0) {
                console.error(
                    '[useChatLogic] acceptInvitation: недействительный invitationId',
                    invitationOrId,
                )
                // Показываем уведомление пользователю
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Недействительное приглашение. Попробуйте перезагрузить страницу.',
                    time: 7000,
                })
                return
            }

            console.log('[useChatLogic] Принимаем приглашение с ID:', invitationId)
            await chat.acceptInvitation(invitationId)
        } catch (error) {
            console.error('[useChatLogic] Ошибка принятия приглашения:', error)
            // Ошибка уже обработана в store
        }
    }

    const declineInvitation = async (invitationOrId: number | IChatInvitation) => {
        try {
            const invitationId =
                typeof invitationOrId === 'number' ? invitationOrId : invitationOrId.id
            if (!invitationId || invitationId <= 0) {
                console.error(
                    '[useChatLogic] declineInvitation: недействительный invitationId',
                    invitationOrId,
                )
                // Показываем уведомление пользователю
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Недействительное приглашение. Попробуйте перезагрузить страницу.',
                    time: 7000,
                })
                return
            }

            console.log('[useChatLogic] Отклоняем приглашение с ID:', invitationId)
            await chat.declineInvitation(invitationId)
        } catch (error) {
            console.error('[useChatLogic] Ошибка отклонения приглашения:', error)
            // Ошибка уже обработана в store
        }
    }

    // Инициализация
    const initialize = async () => {
        console.log('useChatLogic.initialize вызван с опциями:', options)

        // Инициализация медиа-запросов для мобильной адаптации
        if (typeof window !== 'undefined' && 'matchMedia' in window) {
            mediaQueryList = window.matchMedia('(max-width: 767px)')

            if (mediaQueryList.addEventListener) {
                mediaQueryList.addEventListener('change', updateIsMobile)
            } else {
                // Поддержка старых браузеров
                mediaQueryList.addListener?.(updateIsMobile)
            }

            updateIsMobile()
            mobileView.value = isMobile.value ? (chat.currentChat.value ? 'chat' : 'list') : 'list'
        }

        try {
            console.log('useChatLogic.initialize: вызываем chat.initialize()')
            // Загрузка чатов только один раз (предотвращение дублирования запросов)
            await chat.initialize()
            console.log('useChatLogic.initialize: chat.initialize() завершен')

            let chatToOpen: IChat | null = null

            // Попытка найти чат для открытия
            try {
                if (options.userId) {
                    chatToOpen = await chat.createDialog(options.userId)
                } else if (options.initialUserId) {
                    chatToOpen = await chat.createDialog(options.initialUserId)
                } else if (options.initialChatId) {
                    // Сначала ищем чат по ID в загруженном списке
                    chatToOpen =
                        chat.chats.value.find((c: IChat) => c.id === options.initialChatId) || null

                    // Если чат не найден в списке, попробуем открыть напрямую по ID
                    if (!chatToOpen) {
                        try {
                            await chat.openChat(options.initialChatId)
                            // Если успешно открыли, выходим из блока инициализации
                            if (isMobile.value) mobileView.value = 'chat'
                            options.onChatOpen?.(chat.currentChat.value!)
                            return
                        } catch (error) {
                            // Не удалось открыть чат по ID, продолжаем обычную логику
                        }
                    }
                } else {
                    // Попытка восстановить последний выбранный чат из локального хранилища
                    // ТОЛЬКО если не был передан конкретный пользователь
                    try {
                        const savedId = Number(localStorage.getItem('selectedChatId') || '')
                        if (savedId && !Number.isNaN(savedId)) {
                            // Сначала пытаемся найти чат в уже загруженном списке
                            chatToOpen =
                                chat.chats.value.find((c: IChat) => c.id === savedId) || null

                            // Если чат не найден в списке, попробуем открыть по ID
                            // (это загрузит актуальную информацию с сервера)
                            if (!chatToOpen) {
                                try {
                                    await chat.openChat(savedId)
                                    // Если успешно открыли, выходим из блока инициализации
                                    if (isMobile.value) mobileView.value = 'chat'
                                    options.onChatOpen?.(chat.currentChat.value!)
                                    return
                                } catch (error) {
                                    // Не удалось открыть сохраненный чат, продолжаем обычную логику
                                }
                            }
                        }
                    } catch (e) {
                        // Игнорируем ошибки локального хранилища
                    }
                }

                // Если нашли чат для открытия - открываем его
                if (chatToOpen) {
                    try {
                        await chat.openChat(chatToOpen)
                        if (isMobile.value) mobileView.value = 'chat'
                        options.onChatOpen?.(chatToOpen)
                    } catch (error) {
                        // Не удалось открыть чат

                        // Если не удалось открыть выбранный чат, сбрасываем его
                        chat.reset()

                        // Попытаемся открыть первый доступный чат ТОЛЬКО если не был передан конкретный пользователь
                        if (
                            !options.userId &&
                            !options.initialUserId &&
                            chat.chats.value.length > 0
                        ) {
                            try {
                                const firstChat = chat.chats.value[0]
                                await chat.openChat(firstChat)
                                if (isMobile.value) mobileView.value = 'chat'
                                options.onChatOpen?.(firstChat)
                            } catch (fallbackError) {
                                // Не удалось открыть резервный чат
                            }
                        }
                    }
                } else if (
                    !options.userId &&
                    !options.initialUserId &&
                    chat.chats.value.length > 0
                ) {
                    // Если нет конкретного чата для открытия, но есть чаты - открываем первый
                    // ТОЛЬКО если не был передан конкретный пользователь
                    try {
                        const firstChat = chat.chats.value[0]
                        await chat.openChat(firstChat)
                        if (isMobile.value) mobileView.value = 'chat'
                        options.onChatOpen?.(firstChat)
                    } catch (error) {
                        // Не удалось открыть первый чат
                    }
                }
            } catch (error) {
                // Ошибка при инициализации чата

                // Если была ошибка при создании чата с конкретным пользователем,
                // НЕ откатываемся к localStorage чату
                if (options.userId || options.initialUserId) {
                    // Очищаем текущий чат, чтобы показать пустое состояние
                    chat.reset()
                }

                // Не прерываем инициализацию из-за ошибок чата
            }

            // Инициализация скролла
            if (options.messagesContainerSelector) {
                try {
                    const container = document.querySelector(
                        options.messagesContainerSelector,
                    ) as HTMLElement
                    if (container) {
                        messagesContainer.value = container
                        container.addEventListener('scroll', handleScroll, { passive: true })
                    }
                } catch (error) {
                    // Не удалось инициализировать контейнер сообщений
                }
            }

            // Скролл вниз с задержкой для корректной отрисовки
            setTimeout(scrollToBottom, 100)
        } catch (error) {
            // Критическая ошибка при инициализации чата
            // Даже при критической ошибке не прерываем работу приложения
        }
    }

    const cleanup = () => {
        // Очистка обработчиков медиа-запросов
        if (mediaQueryList) {
            if (mediaQueryList.removeEventListener) {
                mediaQueryList.removeEventListener('change', updateIsMobile)
            } else {
                mediaQueryList.removeListener?.(updateIsMobile)
            }
        }

        // Очистка обработчика скролла
        if (messagesContainer.value) {
            messagesContainer.value.removeEventListener('scroll', handleScroll)
        }
    }

    // Наблюдатели с оптимизацией
    watch(
        () => chat.currentChat.value?.id,
        () => {
            autoScroll.value = true
            requestAnimationFrame(scrollToBottom)
        },
        { flush: 'post' },
    )

    watch(
        () => chat.messages.value.length,
        () => {
            if (autoScroll.value) {
                requestAnimationFrame(scrollToBottom)
            }
        },
        { flush: 'post' },
    )

    return {
        // Модуль чата (новая архитектура)
        chat,
        currentUser,

        // Состояние
        messagesContainer,
        autoScroll,
        isMobile,
        mobileView,

        // Вычисляемые свойства
        groupedMessages,

        // Методы управления скроллом
        scrollToBottom,
        handleScroll,

        // Обработчики событий
        openChatFromList,
        performSearch,
        clearSearch,
        createNewDialog,
        sendMessage,
        createChat,
        addMembersToChat,
        inviteUsersToChat,
        removeMemberFromChat,
        updateChatInfo,
        changeReaction,
        removeMyReaction,
        acceptInvitation,
        declineInvitation,

        // Жизненный цикл
        initialize,
        cleanup,

        // Утилиты
        updateIsMobile,

        // Обратная совместимость (обертка для доступа к старому API)
        chatStore: chat,
    }
}
