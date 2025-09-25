/*
 * API сервис для работы с реакциями на сообщения
 * 
 * Содержит все HTTP методы для операций с реакциями:
 * - Получение списка типов реакций
 * - Добавление реакций к сообщениям
 * - Удаление реакций с сообщений
 * - Очистка всех реакций пользователя с сообщения
 */

import axios, { AxiosInstance } from 'axios'
import { BASE_URL } from '@/refactoring/environment/environment'
import type { IReactionType } from '@/refactoring/modules/chat/types/IChat'
import type {
    ReactionTypesApiResponse,
    AddReactionPayload,
    ChatApiResult,
} from '@/refactoring/modules/chat/types/api'

/**
 * Сервис для работы с API реакций
 */
export class ReactionApiService {
    private axiosInstance: AxiosInstance

    constructor(axiosInstance: AxiosInstance = axios) {
        this.axiosInstance = axiosInstance
    }

    /**
     * Загружает типы реакций с сервера
     */
    async fetchReactionTypes(): Promise<ChatApiResult<IReactionType[]>> {
        try {
            const response = await this.axiosInstance.get<ReactionTypesApiResponse>(
                `${BASE_URL}/api/chat/chat/reactions/types/`
            )
            
            const reactionTypes = response.data

            if (Array.isArray(reactionTypes)) {
                return {
                    success: true,
                    data: reactionTypes,
                }
            } else {
                // Fallback типы реакций
                const fallbackTypes: IReactionType[] = [
                    { id: 1, name: 'Like', icon: '👍' },
                    { id: 2, name: 'Love', icon: '❤️' },
                    { id: 3, name: 'Laugh', icon: '😂' },
                    { id: 4, name: 'Wow', icon: '😮' },
                    { id: 5, name: 'Sad', icon: '😢' },
                    { id: 6, name: 'Angry', icon: '😠' },
                ]

                return {
                    success: true,
                    data: fallbackTypes,
                }
            }
        } catch (error) {
            // При ошибке возвращаем fallback типы
            const fallbackTypes: IReactionType[] = [
                { id: 1, name: 'Like', icon: '👍' },
                { id: 2, name: 'Love', icon: '❤️' },
                { id: 3, name: 'Laugh', icon: '😂' },
                { id: 4, name: 'Wow', icon: '😮' },
                { id: 5, name: 'Sad', icon: '😢' },
                { id: 6, name: 'Angry', icon: '😠' },
            ]

            return {
                success: false,
                error: 'Не удалось загрузить типы реакций, используются стандартные',
                data: fallbackTypes,
            }
        }
    }

    /**
     * Добавляет реакцию на сообщение
     */
    async addReaction(chatId: number, messageId: number, payload: AddReactionPayload): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.post(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/reactions/`,
                payload
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось добавить реакцию',
            }
        }
    }

    /**
     * Удаляет реакцию с сообщения (автоматически удалит реакцию текущего пользователя)
     */
    async removeReaction(chatId: number, messageId: number): Promise<ChatApiResult<void>> {
        try {
            // Параметры не передаем - API автоматически удалит реакцию текущего пользователя
            await this.axiosInstance.delete(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/reactions/`
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось удалить реакцию',
            }
        }
    }

    /**
     * Очищает все реакции текущего пользователя с сообщения
     */
    async clearMyReactions(chatId: number, messageId: number): Promise<ChatApiResult<void>> {
        try {
            // Используем тот же DELETE эндпоинт без параметров
            await this.axiosInstance.delete(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/reactions/`
            )

            return {
                success: true,
            }
        } catch (error) {
            // Игнорируем ошибки при очистке (возможно реакции уже нет)
            return {
                success: false,
                error: 'Не удалось очистить реакции (возможно их уже нет)',
            }
        }
    }

    /**
     * Устанавливает эксклюзивную реакцию (удаляет старую и добавляет новую)
     */
    async setExclusiveReaction(chatId: number, messageId: number, reactionTypeId: number): Promise<ChatApiResult<void>> {
        try {
            // Сначала удаляем все мои реакции
            await this.clearMyReactions(chatId, messageId)
            
            // Затем добавляем новую
            const addResult = await this.addReaction(chatId, messageId, { 
                reaction_type_id: reactionTypeId 
            })

            if (!addResult.success) {
                return {
                    success: false,
                    error: 'Не удалось установить реакцию',
                }
            }

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось установить эксклюзивную реакцию',
            }
        }
    }
}

// Создаем глобальный экземпляр сервиса
export const reactionApiService = new ReactionApiService()