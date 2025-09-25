/*
 * API сервис для работы с сообщениями
 * 
 * Содержит все HTTP методы для операций с сообщениями:
 * - Загрузка сообщений чата
 * - Отправка текстовых сообщений
 * - Отправка сообщений с файлами
 * - Обновление сообщений
 * - Удаление сообщений
 * - Получение списка читателей сообщения
 * - Загрузка вложений
 */

import axios, { AxiosInstance } from 'axios'
import { BASE_URL } from '@/refactoring/environment/environment'
import type { IMessage } from '@/refactoring/modules/chat/types/IChat'
import type {
    MessagesApiResponse,
    MessageApiResponse,
    SendMessagePayload,
    UpdateMessagePayload,
    ChatApiResult,
} from '@/refactoring/modules/chat/types/api'

/**
 * Сервис для работы с API сообщений
 */
export class MessageApiService {
    private axiosInstance: AxiosInstance

    constructor(axiosInstance: AxiosInstance = axios) {
        this.axiosInstance = axiosInstance
    }

    /**
     * Загружает сообщения выбранного чата
     */
    async fetchMessages(chatId: number): Promise<ChatApiResult<IMessage[]>> {
        try {
            const response = await this.axiosInstance.get<MessagesApiResponse>(
                `${BASE_URL}/api/chat/chat/${chatId}/message/`
            )
            
            const messages = response.data?.results ?? response.data

            if (Array.isArray(messages)) {
                return {
                    success: true,
                    data: messages,
                }
            } else {
                return {
                    success: true,
                    data: [],
                }
            }
        } catch (error) {
            // При ошибке 404 или другой ошибке - возвращаем пустой массив
            return {
                success: false,
                error: 'Не удалось загрузить сообщения',
                data: [],
            }
        }
    }

    /**
     * Отправляет текстовое сообщение в чат
     */
    async sendMessage(chatId: number, content: string): Promise<ChatApiResult<IMessage>> {
        try {
            const response = await this.axiosInstance.post<MessageApiResponse>(
                `${BASE_URL}/api/chat/chat/${chatId}/message/`,
                { content }
            )
            
            const message = response.data

            return {
                success: true,
                data: message,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось отправить сообщение',
            }
        }
    }

    /**
     * Отправляет сообщение с файлами
     */
    async sendMessageWithFiles(chatId: number, payload: SendMessagePayload): Promise<ChatApiResult<IMessage>> {
        try {
            const form = new FormData()
            form.append('content', payload.content)
            
            // Добавляем все файлы в форму с параметром "files" как указано в API
            if (payload.files) {
                payload.files.forEach((file) => {
                    form.append('files', file)
                })
            }

            const response = await this.axiosInstance.post<MessageApiResponse>(
                `${BASE_URL}/api/chat/chat/${chatId}/message/`,
                form,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            )
            
            const message = response.data

            return {
                success: true,
                data: message,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось отправить сообщение с файлами',
            }
        }
    }

    /**
     * Обновляет содержимое сообщения
     */
    async updateMessage(chatId: number, messageId: number, payload: UpdateMessagePayload): Promise<ChatApiResult<IMessage>> {
        try {
            const response = await this.axiosInstance.patch<MessageApiResponse>(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/`,
                payload
            )
            
            const updatedMessage = response.data

            return {
                success: true,
                data: updatedMessage,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось изменить сообщение',
            }
        }
    }

    /**
     * Удаляет сообщение
     */
    async deleteMessage(chatId: number, messageId: number): Promise<ChatApiResult<void>> {
        try {
            await this.axiosInstance.delete(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/`
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось удалить сообщение',
            }
        }
    }

    /**
     * Получает список пользователей, которые прочитали сообщение
     */
    async fetchMessageReaders(chatId: number, messageId: number): Promise<ChatApiResult<any[]>> {
        try {
            const response = await this.axiosInstance.get(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/readers/`
            )
            
            const readers = response.data?.results ?? response.data

            return {
                success: true,
                data: Array.isArray(readers) ? readers : [],
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось получить список читателей',
                data: [],
            }
        }
    }

    /**
     * Загружает файл-вложение для указанного сообщения
     */
    async uploadAttachment(chatId: number, messageId: number, file: File): Promise<ChatApiResult<void>> {
        try {
            const form = new FormData()
            form.append('file', file)

            await this.axiosInstance.post(
                `${BASE_URL}/api/chat/chat/${chatId}/message/${messageId}/attachments/`,
                form,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                }
            )

            return {
                success: true,
            }
        } catch (error) {
            return {
                success: false,
                error: 'Не удалось загрузить файл',
            }
        }
    }
}

// Создаем глобальный экземпляр сервиса
export const messageApiService = new MessageApiService()