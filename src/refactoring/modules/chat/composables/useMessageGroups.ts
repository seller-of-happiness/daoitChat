/**
 * Композибл для группировки сообщений по дням
 */

import { computed } from 'vue'
import type { IMessage } from '../types/IChat'
import { formatMessageDate, sortByDate } from '../utils/chatUtils'

interface MessageGroup {
    key: string
    label: string
    items: IMessage[]
}

export function useMessageGroups(messages: () => IMessage[]) {
    const groupedMessages = computed((): MessageGroup[] => {
        const messageList = messages()
        if (!messageList.length) return []

        // Сортируем по дате (старые сначала)
        const sortedMessages = sortByDate(messageList, 'asc')

        // Группируем по дням
        const groups: Record<string, IMessage[]> = {}

        sortedMessages.forEach((message) => {
            const dateKey = new Date(message.created_at).toDateString()
            if (!groups[dateKey]) {
                groups[dateKey] = []
            }
            groups[dateKey].push(message)
        })

        // Конвертируем в нужный формат
        return Object.entries(groups).map(([dateKey, items]) => ({
            key: dateKey,
            label: formatMessageDate(items[0].created_at),
            items,
        }))
    })

    return {
        groupedMessages,
    }
}
