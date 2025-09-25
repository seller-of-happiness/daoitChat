/*
 * API сервис для работы с приглашениями в чаты
 * 
 * Содержит все HTTP методы для операций с приглашениями:
 * - Получение списка приглашений
 * - Принятие приглашений
 * - Отклонение приглашений
 * - Удаление отправленных приглашений
 */

import axios, { AxiosInstance } from 'axios'
import { BASE_URL } from '@/refactoring/environment/environment'
import type { IChatInvitation } from '@/refactoring/modules/chat/types/IChat'
import type {
    InvitationsApiResponse,
    ChatApiResult,
} from '@/refactoring/modules/chat/types/api'

/**
 * Сервис для работы с API приглашений в чаты
 */
export class InviteApiService {
    private axiosInstance: AxiosInstance

    constructor(axiosInstance: AxiosInstance = axios) {
        this.axiosInstance = axiosInstance
    }

    /**
     * Получает список приглашений в чаты для текущего пользователя
     */
    async fetchInvitations(): Promise<ChatApiResult<IChatInvitation[]>> {
        try {
            const response = await this.axiosInstance.get<InvitationsApiResponse>(
                `${BASE_URL}/api/chat/invite/`
            )
            
            const invitationsData = response.data?.results ?? response.data

            if (Array.isArray(invitationsData)) {
                return {
                    success: true,
                    data: invitationsData,
                }
            } else {
                return {
                    success: true,
                    data: [],
                }
            }
        } catch (error) {
            // При ошибке устанавливаем пустой массив
            return {
                success: false,
                error: 'Не удалось загрузить приглашения',
                data: [],
            }
        }
    }

    /**
     * Принимает приглашение в чат
     */
    async acceptInvitation(invitationId: number): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.post(
                `${BASE_URL}/api/chat/invite/${invitationId}/accept/`
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось принять приглашение',
            }
        }
    }

    /**
     * Отклоняет полученное приглашение
     */
    async declineInvitation(invitationId: number): Promise<ChatApiResult<void>> {
        try {
            // Используем правильный endpoint для отклонения приглашения
            await this.axiosInstance.delete(
                `${BASE_URL}/api/chat/invite/${invitationId}/decline/`
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось отклонить приглашение',
            }
        }
    }

    /**
     * Удаляет отправленное приглашение (отзывает)
     */
    async removeInvitation(invitationId: number): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.delete(
                `${BASE_URL}/api/chat/invite/${invitationId}/remove/`
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось отозвать приглашение',
            }
        }
    }
}

// Создаем глобальный экземпляр сервиса
export const inviteApiService = new InviteApiService()