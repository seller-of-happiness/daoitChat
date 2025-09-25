/*
 * Типы для API ответов чат модуля
 */

import type { IChat, IMessage, IReactionType, IChatInvitation, ISearchResults } from './IChat'

// Базовый тип для API ответов
export interface ApiResponse<T> {
    results?: T
    data?: T
}

// Результат операций с чатами
export interface ChatApiResult<T = any> {
    success: boolean
    data?: T
    error?: string
}

// Типы для создания чатов
export interface CreateChatPayload {
    title: string
    description?: string
    icon?: File | null
}

export interface CreateDialogPayload {
    user_id: string
}

// Типы для обновления чата
export interface UpdateChatPayload {
    title?: string
    description?: string
    icon?: File | null
}

// Типы для работы с участниками
export interface AddMembersPayload {
    user_ids: string[]
}

export interface RemoveMemberPayload {
    user_id: string
}

// Типы для поиска
export interface SearchChatsParams {
    q: string
    include_public?: boolean
}

// Типы для отправки сообщений
export interface SendMessagePayload {
    content: string
    files?: File[]
}

export interface UpdateMessagePayload {
    content: string
}

// Типы для реакций
export interface AddReactionPayload {
    reaction_type_id: number
}

// Типы для счетчиков непрочитанных
export interface UnreadCount {
    chat_id: number
    unread_count: number
}

export type UnreadCountsResponse = UnreadCount[] | Record<string, number>

// Обертки для типизированных API ответов
export type ChatsApiResponse = ApiResponse<IChat[]>
export type ChatApiResponse = ApiResponse<IChat>
export type MessagesApiResponse = ApiResponse<IMessage[]>
export type MessageApiResponse = ApiResponse<IMessage>
export type ReactionTypesApiResponse = ApiResponse<IReactionType[]>
export type InvitationsApiResponse = ApiResponse<IChatInvitation[]>
export type SearchApiResponse = ISearchResults
export type UnreadCountsApiResponse = ApiResponse<UnreadCountsResponse>