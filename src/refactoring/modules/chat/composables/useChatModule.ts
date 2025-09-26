/*
 * Главный композибл чат модуля
 *
 * Предоставляет единый API для работы с чатами, объединяя все специализированные сторы.
 * Этот композибл является единой точкой входа для компонентов Vue.
 *
 * Основные функции:
 * - Проксирование методов из разных сторов
 * - Предоставление единого API для компонентов
 * - Управление состоянием всего чат модуля
 * - Координация инициализации
 */

import { computed } from 'vue'
import { useChatStore } from '@/refactoring/modules/chat/stores/chatStore'
import { useMessagesStore } from '@/refactoring/modules/chat/stores/messagesStore'
import { useMembersStore } from '@/refactoring/modules/chat/stores/membersStore'
import { useSearchStore } from '@/refactoring/modules/chat/stores/searchStore'
import { useRealtimeStore } from '@/refactoring/modules/chat/stores/realtimeStore'
import type {
    IChat,
    IMessage,
    IReactionType,
    IChatInvitation,
    ISearchResults,
} from '@/refactoring/modules/chat/types/IChat'

export function useChatModule() {
    // Получаем все специализированные сторы
    const chatStore = useChatStore()
    const messagesStore = useMessagesStore()
    const membersStore = useMembersStore()
    const searchStore = useSearchStore()
    const realtimeStore = useRealtimeStore()

    // ============ СОСТОЯНИЕ ============

    // Основное состояние чатов
    const chats = computed(() => chatStore.chats)
    const currentChat = computed(() => chatStore.currentChat)
    const isLoadingChats = computed(() => chatStore.isLoadingChats)
    const isInitialized = computed(() => chatStore.isInitialized)

    // Состояние сообщений
    const messages = computed(() => messagesStore.sortedMessages)
    const isLoadingMessages = computed(() => messagesStore.isLoadingMessages)
    const isSending = computed(() => messagesStore.isSending)
    const reactionTypes = computed(() => messagesStore.reactionTypes)

    // Состояние участников и приглашений
    const invitations = computed(() => membersStore.invitations)
    const activeInvitationsCount = computed(() => membersStore.activeInvitationsCount)
    const isLoadingInvitations = computed(() => membersStore.isLoadingInvitations)

    // Состояние поиска
    const searchResults = computed(() => searchStore.searchResults)
    const isSearching = computed(() => searchStore.isSearching)
    const hasSearchResults = computed(() => searchStore.hasResults)

    // Состояние realtime соединения
    const isConnected = computed(() => realtimeStore.isConnected)
    const connectionStatus = computed(() => realtimeStore.connectionStatusText)

    // Агрегированные геттеры
    const totalUnreadCount = computed(() => chatStore.totalUnreadCount)
    const hasMessages = computed(() => messagesStore.hasMessages)
    const lastMessage = computed(() => messagesStore.lastMessage)

    // ============ МЕТОДЫ ИНИЦИАЛИЗАЦИИ ============

    /**
     * Инициализирует весь чат модуль
     */
    const initialize = async (): Promise<void> => {
        await chatStore.initializeOnce()
    }

    /**
     * Сбрасывает состояние всего модуля
     */
    const reset = (): void => {
        chatStore.resetInitialization()
    }

    // ============ МЕТОДЫ РАБОТЫ С ЧАТАМИ ============

    /**
     * Загружает список чатов
     */
    const fetchChats = async (): Promise<void> => {
        await chatStore.fetchChats()
    }

    /**
     * Открывает чат
     */
    const openChat = async (chatOrId: IChat | number): Promise<void> => {
        if (typeof chatOrId === 'number') {
            await chatStore.openChatById(chatOrId)
        } else {
            await chatStore.openChat(chatOrId)
        }
    }

    /**
     * Создает диалог с пользователем
     */
    const createDialog = async (userId: string): Promise<IChat> => {
        return await chatStore.createDialog(userId)
    }

    /**
     * Создает групповой чат
     */
    const createGroup = async (payload: {
        title: string
        description?: string
        icon?: File | null
    }): Promise<IChat> => {
        return await chatStore.createGroup(payload)
    }

    /**
     * Создает канал
     */
    const createChannel = async (payload: {
        title: string
        description?: string
        icon?: File | null
    }): Promise<IChat> => {
        return await chatStore.createChannel(payload)
    }

    /**
     * Обновляет чат
     */
    const updateChat = async (chatId: number, payload: Partial<IChat>): Promise<IChat> => {
        return await chatStore.updateChat(chatId, payload)
    }

    /**
     * Удаляет чат
     */
    const deleteChat = async (chatId: number): Promise<void> => {
        await chatStore.deleteChat(chatId)
    }

    // ============ МЕТОДЫ РАБОТЫ С СООБЩЕНИЯМИ ============

    /**
     * Отправляет текстовое сообщение
     */
    const sendMessage = async (chatId: number, content: string): Promise<IMessage | null> => {
        return await messagesStore.sendMessage(chatId, content)
    }

    /**
     * Отправляет сообщение с файлами
     */
    const sendMessageWithFiles = async (
        chatId: number,
        content: string,
        files: File[],
    ): Promise<IMessage | null> => {
        return await messagesStore.sendMessageWithFiles(chatId, content, files)
    }

    /**
     * Обновляет сообщение
     */
    const updateMessage = async (
        chatId: number,
        messageId: number,
        content: string,
    ): Promise<IMessage | null> => {
        return await messagesStore.updateMessage(chatId, messageId, content)
    }

    /**
     * Удаляет сообщение
     */
    const deleteMessage = async (chatId: number, messageId: number): Promise<void> => {
        await messagesStore.deleteMessage(chatId, messageId)
    }

    // ============ МЕТОДЫ РАБОТЫ С РЕАКЦИЯМИ ============

    /**
     * Загружает типы реакций
     */
    const fetchReactionTypes = async (): Promise<void> => {
        await messagesStore.fetchReactionTypes()
    }

    /**
     * Добавляет реакцию на сообщение
     */
    const addReaction = async (messageId: number, reactionTypeId: number): Promise<void> => {
        await messagesStore.addReaction(messageId, reactionTypeId)
    }

    /**
     * Удаляет реакцию с сообщения
     */
    const removeReaction = async (messageId: number): Promise<void> => {
        await messagesStore.removeReaction(messageId)
    }

    /**
     * Устанавливает эксклюзивную реакцию
     */
    const setExclusiveReaction = async (
        messageId: number,
        reactionTypeId: number,
    ): Promise<void> => {
        await messagesStore.setExclusiveReaction(messageId, reactionTypeId)
    }

    // ============ МЕТОДЫ РАБОТЫ С УЧАСТНИКАМИ И ПРИГЛАШЕНИЯМИ ============

    /**
     * Загружает приглашения
     */
    const fetchInvitations = async (): Promise<void> => {
        await membersStore.fetchInvitations()
    }

    /**
     * Принимает приглашение
     */
    const acceptInvitation = async (invitationId: number): Promise<boolean> => {
        const success = await membersStore.acceptInvitation(invitationId)
        if (success) {
            // Обновляем список чатов после принятия приглашения
            await chatStore.fetchChats()
        }
        return success
    }

    /**
     * Отклоняет приглашение
     */
    const declineInvitation = async (invitationId: number): Promise<boolean> => {
        return await membersStore.declineInvitation(invitationId)
    }

    /**
     * Удаляет приглашение
     */
    const removeInvitation = async (invitationId: number): Promise<boolean> => {
        return await membersStore.removeInvitation(invitationId)
    }

    /**
     * Добавляет участников в чат
     */
    const addMembersToChat = async (chatId: number, userIds: string[]): Promise<boolean> => {
        try {
            await chatStore.addMembersToChat(chatId, userIds)
            return true
        } catch (error) {
            console.error('Error adding members to chat:', error)
            return false
        }
    }

    /**
     * Удаляет участника из чата
     */
    const removeMemberFromChat = async (chatId: number, userId: string): Promise<boolean> => {
        try {
            await chatStore.removeMemberFromChat(chatId, userId)
            return true
        } catch (error) {
            console.error('Error removing member from chat:', error)
            return false
        }
    }

    // ============ МЕТОДЫ ПОИСКА ============

    /**
     * Выполняет поиск чатов с дебаунсингом
     */
    const searchChats = async (query: string, includePublic: boolean = true): Promise<void> => {
        await searchStore.searchChats(query, includePublic)
    }

    /**
     * Выполняет поиск с немедленным результатом
     */
    const searchImmediate = async (
        query: string,
        includePublic: boolean = true,
    ): Promise<ISearchResults | null> => {
        return await searchStore.searchImmediate(query, includePublic)
    }

    /**
     * Очищает результаты поиска
     */
    const clearSearch = (): void => {
        searchStore.clearSearch()
    }

    // ============ МЕТОДЫ РАБОТЫ С REALTIME ============

    /**
     * Проверяет состояние подключения
     */
    const checkConnectionHealth = (): boolean => {
        return realtimeStore.checkConnectionHealth()
    }

    /**
     * Принудительно переподключается
     */
    const forceReconnect = async (): Promise<boolean> => {
        return await realtimeStore.forceReconnect()
    }

    // ============ ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ ============

    /**
     * Получает чаты по типу
     */
    const getChatsByType = (type: string) => {
        return chatStore.chatsByType(type)
    }

    /**
     * Получает непрочитанные чаты
     */
    const getUnreadChats = () => {
        return chatStore.unreadChats
    }

    /**
     * Получает активные чаты
     */
    const getActiveChats = () => {
        return chatStore.activeChats
    }

    /**
     * Получает приглашения по статусу
     */
    const getInvitationsByStatus = (isAccepted: boolean) => {
        return membersStore.invitationsByStatus(isAccepted)
    }

    /**
     * Получает результаты поиска по типу
     */
    const getSearchResultsByType = (type: 'chats' | 'new_dialogs') => {
        return searchStore.getResultsByType(type)
    }

    // ============ МЕТОДЫ СОВМЕСТИМОСТИ ============

    /**
     * Находит или создает диалог (для совместимости)
     */
    const findOrCreateDirectChat = async (userId: string): Promise<IChat> => {
        return await chatStore.findOrCreateDirectChat(userId)
    }

    /**
     * Создает прямой чат (для совместимости)
     */
    const createDirectChat = async (employeeId: string): Promise<IChat> => {
        return await chatStore.createDirectChat(employeeId)
    }

    /**
     * Отмечает чат как прочитанный
     */
    const markChatAsRead = async (chatId: number, lastMessageId?: number): Promise<void> => {
        await chatStore.markChatAsRead(chatId, lastMessageId)
    }

    // Возвращаем публичное API
    return {
        // Состояние
        chats,
        currentChat,
        messages,
        invitations,
        searchResults,
        reactionTypes,

        // Флаги состояния
        isLoadingChats,
        isLoadingMessages,
        isLoadingInvitations,
        isSending,
        isSearching,
        isInitialized,
        isConnected,

        // Вычисляемые свойства
        totalUnreadCount,
        activeInvitationsCount,
        hasSearchResults,
        hasMessages,
        lastMessage,
        connectionStatus,

        // Методы инициализации
        initialize,
        reset,

        // Методы чатов
        fetchChats,
        openChat,
        createDialog,
        createGroup,
        createChannel,
        updateChat,
        deleteChat,

        // Методы сообщений
        sendMessage,
        sendMessageWithFiles,
        updateMessage,
        deleteMessage,

        // Методы реакций
        fetchReactionTypes,
        addReaction,
        removeReaction,
        setExclusiveReaction,

        // Методы участников
        fetchInvitations,
        acceptInvitation,
        declineInvitation,
        removeInvitation,
        addMembersToChat,
        removeMemberFromChat,

        // Методы поиска
        searchChats,
        searchImmediate,
        clearSearch,

        // Методы realtime
        checkConnectionHealth,
        forceReconnect,

        // Вспомогательные методы
        getChatsByType,
        getUnreadChats,
        getActiveChats,
        getInvitationsByStatus,
        getSearchResultsByType,

        // Методы совместимости
        findOrCreateDirectChat,
        createDirectChat,
        markChatAsRead,
    }
}
