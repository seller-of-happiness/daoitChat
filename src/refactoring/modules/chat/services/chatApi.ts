/*
 * API сервис для работы с чатами
 * 
 * Содержит все HTTP методы для CRUD операций с чатами:
 * - Загрузка списка чатов
 * - Создание диалогов, групп и каналов
 * - Получение информации о чате
 * - Обновление чата
 * - Управление участниками (добавление/удаление)
 * - Поиск чатов
 * - Получение счетчиков непрочитанных сообщений
 */

import axios, { AxiosInstance } from 'axios'
import { BASE_URL } from '@/refactoring/environment/environment'
import type {
    IChat,
    ISearchResults,
} from '@/refactoring/modules/chat/types/IChat'
import type {
    ChatsApiResponse,
    ChatApiResponse,
    CreateChatPayload,
    CreateDialogPayload,
    UpdateChatPayload,
    AddMembersPayload,
    SearchChatsParams,
    SearchApiResponse,
    UnreadCountsApiResponse,
    UnreadCountsResponse,
    ChatApiResult,
} from '@/refactoring/modules/chat/types/api'

/**
 * Сервис для работы с API чатов
 * Использует паттерн Repository с инъекцией axios instance
 */
export class ChatApiService {
    private axiosInstance: AxiosInstance

    constructor(axiosInstance: AxiosInstance = axios) {
        this.axiosInstance = axiosInstance
    }

    /**
     * Получает список всех чатов пользователя
     */
    async fetchChats(): Promise<ChatApiResult<IChat[]>> {
        try {
            const response = await this.axiosInstance.get<ChatsApiResponse>(`${BASE_URL}/api/chat/chat/`)
            const chatsData = response.data?.results ?? response.data

            if (Array.isArray(chatsData)) {
                return {
                    success: true,
                    data: chatsData,
                }
            } else {
                return {
                    success: true,
                    data: [],
                }
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось загрузить чаты',
                data: [],
            }
        }
    }

    /**
     * Создает диалог с пользователем или возвращает существующий
     */
    async createDialog(payload: CreateDialogPayload): Promise<ChatApiResult<IChat>> {
        try {
            const response = await this.axiosInstance.post<ChatApiResponse>(
                `${BASE_URL}/api/chat/chat/dialog/`,
                payload
            )
            
            // В зависимости от ответа API может вернуть объект chat или напрямую данные чата
            const chat = response.data.chat || response.data

            return {
                success: true,
                data: chat as IChat,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось создать диалог',
            }
        }
    }

    /**
     * Создает групповой чат
     */
    async createGroup(payload: CreateChatPayload): Promise<ChatApiResult<IChat>> {
        try {
            const form = new FormData()
            form.append('title', payload.title || '')
            if (payload.description) form.append('description', payload.description)
            if (payload.icon) form.append('icon', payload.icon)

            const response = await this.axiosInstance.post<ChatApiResponse>(
                `${BASE_URL}/api/chat/chat/group/`,
                form,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            )
            
            const chat = response.data?.results ?? response.data

            return {
                success: true,
                data: chat as IChat,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось создать группу',
            }
        }
    }

    /**
     * Создает канал
     */
    async createChannel(payload: CreateChatPayload): Promise<ChatApiResult<IChat>> {
        try {
            const form = new FormData()
            form.append('title', payload.title || '')
            if (payload.description) form.append('description', payload.description)
            if (payload.icon) form.append('icon', payload.icon)

            const response = await this.axiosInstance.post<ChatApiResponse>(
                `${BASE_URL}/api/chat/chat/channel/`,
                form,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            )
            
            const chat = response.data?.results ?? response.data

            return {
                success: true,
                data: chat as IChat,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось создать канал',
            }
        }
    }

    /**
     * Получает информацию о конкретном чате
     */
    async fetchChat(chatId: number): Promise<ChatApiResult<IChat>> {
        try {
            const response = await this.axiosInstance.get<ChatApiResponse>(
                `${BASE_URL}/api/chat/chat/${chatId}/`
            )
            
            const chat = response.data?.results ?? response.data

            return {
                success: true,
                data: chat as IChat,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось загрузить информацию о чате',
            }
        }
    }

    /**
     * Обновляет информацию о чате
     */
    async updateChat(chatId: number, payload: UpdateChatPayload): Promise<ChatApiResult<IChat>> {
        try {
            const form = new FormData()

            // Добавляем только обновляемые поля
            if (payload.title !== undefined) form.append('title', payload.title)
            if (payload.description !== undefined) form.append('description', payload.description)
            if (payload.icon !== undefined) {
                if (payload.icon === null) {
                    form.append('icon', '')
                } else if (payload.icon instanceof File) {
                    form.append('icon', payload.icon)
                }
            }

            const response = await this.axiosInstance.put<ChatApiResponse>(
                `${BASE_URL}/api/chat/chat/${chatId}/`,
                form,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            )
            
            const updatedChat = response.data?.results ?? response.data

            return {
                success: true,
                data: updatedChat as IChat,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось обновить чат',
            }
        }
    }

    /**
     * Удаляет чат
     */
    async deleteChat(chatId: number): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.delete(`${BASE_URL}/api/chat/chat/${chatId}/`)

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось удалить чат',
            }
        }
    }

    /**
     * Добавляет участников в чат (отправляет приглашения)
     */
    async addMembersToChat(chatId: number, payload: AddMembersPayload): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.post(
                `${BASE_URL}/api/chat/chat/${chatId}/add-members/`,
                payload
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось пригласить участников',
            }
        }
    }

    /**
     * Удаляет участника из чата
     */
    async removeMemberFromChat(chatId: number, userId: string): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.delete(
                `${BASE_URL}/api/chat/chat/${chatId}/remove-member/?user_id=${userId}`
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось удалить участника',
            }
        }
    }

    /**
     * Выполняет поиск чатов и предложений новых диалогов
     */
    async searchChats(params: SearchChatsParams): Promise<ChatApiResult<ISearchResults>> {
        try {
            if (!params.q.trim()) {
                return {
                    success: true,
                    data: { chats: [], new_dialogs: [] },
                }
            }

            const urlParams = new URLSearchParams({
                q: params.q.trim(),
                ...(params.include_public && { include_public: 'true' }),
            })

            const response = await this.axiosInstance.get<SearchApiResponse>(
                `${BASE_URL}/api/chat/chat/search/?${urlParams.toString()}`
            )

            return {
                success: true,
                data: response.data,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось выполнить поиск',
                data: { chats: [], new_dialogs: [] },
            }
        }
    }

    /**
     * Получает счетчики непрочитанных сообщений для всех чатов
     */
    async fetchUnreadCounts(): Promise<ChatApiResult<UnreadCountsResponse>> {
        try {
            const response = await this.axiosInstance.get<UnreadCountsApiResponse>(
                `${BASE_URL}/api/chat/chat/unread-counts/`
            )
            
            const unreadData = response.data?.results ?? response.data

            return {
                success: true,
                data: unreadData as UnreadCountsResponse,
            }
        } catch (error) {
            // API может возвращать 404 если не реализован - возвращаем пустой объект
            return {
                success: true,
                data: {},
            }
        }
    }
}

// Создаем глобальный экземпляр сервиса
export const chatApiService = new ChatApiService()