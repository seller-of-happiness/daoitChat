/**
 * Утилиты для работы с чатами
 * Чистые функции без зависимостей
 */

import type { IChat, IMessage, IChatMember, IUser } from '../types/IChat'

// === Chat Utils ===
export function getChatTitle(chat: IChat, currentUserId?: string): string {
    if (chat.type === 'dialog' && chat.members && currentUserId) {
        const companion = chat.members.find((member) => getUserId(member.user) !== currentUserId)
        return companion ? getUserDisplayName(companion.user) : chat.title
    }
    return chat.title
}

export function getChatInitials(title: string): string {
    return title
        .split(' ')
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
}

export function isUserAdmin(chat: IChat, userId: string): boolean {
    return (
        chat.members?.some((member) => getUserId(member.user) === userId && member.is_admin) ||
        false
    )
}

export function isMyMessage(message: IMessage, currentUserId?: string | number): boolean {
    if (!currentUserId) return false

    const messageUserId = message.author_id || message.user_id || message.author
    return String(messageUserId) === String(currentUserId)
}

// === User Utils ===
export function getUserId(user: IUser | string): string {
    return typeof user === 'string' ? user : user.id
}

export function getUserDisplayName(user: IUser | string): string {
    if (typeof user === 'string') return user

    const { first_name, last_name, full_name, user_name, username, email } = user

    if (full_name) return full_name
    if (first_name || last_name) {
        return [first_name, last_name].filter(Boolean).join(' ')
    }

    return user_name || username || email || 'Пользователь'
}

export function getUserShortName(user: IUser | string): string {
    if (typeof user === 'string') return user

    const { first_name, last_name } = user
    if (first_name && last_name) {
        return `${first_name} ${last_name.charAt(0)}.`
    }

    return getUserDisplayName(user)
}

// === Message Utils ===
export function groupMessagesByDate(messages: IMessage[]): Array<{
    date: string
    messages: IMessage[]
}> {
    const groups: Record<string, IMessage[]> = {}

    messages.forEach((message) => {
        const date = new Date(message.created_at).toDateString()
        if (!groups[date]) {
            groups[date] = []
        }
        groups[date].push(message)
    })

    return Object.entries(groups).map(([date, messages]) => ({
        date,
        messages,
    }))
}

export function formatMessageTime(timestamp: string): string {
    return new Date(timestamp).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
    })
}

export function formatMessageDate(timestamp: string): string {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
        return 'Сегодня'
    }

    if (date.toDateString() === yesterday.toDateString()) {
        return 'Вчера'
    }

    return date.toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'long',
    })
}

// === Validation Utils ===
export function isValidChatTitle(title: string): boolean {
    return title.trim().length >= 1 && title.trim().length <= 100
}

export function isValidMessageContent(content: string): boolean {
    return content.trim().length > 0 && content.trim().length <= 4000
}

// === Array Utils ===
export function uniqueById<T extends { id: number | string }>(items: T[]): T[] {
    const seen = new Set()
    return items.filter((item) => {
        if (seen.has(item.id)) {
            return false
        }
        seen.add(item.id)
        return true
    })
}

export function sortByDate<T extends { created_at: string }>(
    items: T[],
    direction: 'asc' | 'desc' = 'desc',
): T[] {
    return [...items].sort((a, b) => {
        const dateA = new Date(a.created_at).getTime()
        const dateB = new Date(b.created_at).getTime()
        return direction === 'desc' ? dateB - dateA : dateA - dateB
    })
}
