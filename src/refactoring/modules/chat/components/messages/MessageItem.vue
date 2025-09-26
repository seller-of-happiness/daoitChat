<template>
    <div
        :class="['message mb-4', isMine ? 'message--mine' : 'message--theirs']"
        @mouseenter="showActions = true"
        @mouseleave="showActions = false"
    >
        <div class="message-wrapper">
            <div class="message-bubble relative">
                <div class="message-content py-3 px-4">
                    <div class="flex justify-between items-end gap-4">
                        <div class="flex-1">
                            <div class="text" v-html="safeContent"></div>
                            <MessageReactionsBar
                                v-if="groupedReactions.length"
                                :groups="groupedReactions"
                                @reaction-click="handleReactionClick"
                            />
                        </div>
                        <span class="text-sm text-gray-500 whitespace-nowrap">
                            {{ formatTime(message.created_at) }}
                        </span>
                    </div>
                </div>

                <!-- Действия при наведении -->
                <div
                    v-if="showActions"
                    class="message-actions absolute -top-2 flex gap-1 bg-white shadow-lg rounded-lg border p-1"
                    :class="isMine ? 'right-4' : 'left-4'"
                >
                    <Button
                        icon="pi pi-thumbs-up"
                        size="small"
                        text
                        rounded
                        :severity="hasMyReaction ? 'primary' : 'secondary'"
                        @click="toggleReaction"
                    />

                    <Button
                        v-if="isMine"
                        icon="pi pi-pencil"
                        size="small"
                        text
                        rounded
                        severity="secondary"
                        @click="editMessage"
                    />

                    <Button
                        v-if="isMine"
                        icon="pi pi-trash"
                        size="small"
                        text
                        rounded
                        severity="danger"
                        @click="deleteMessage"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import DOMPurify from 'dompurify'

import MessageReactionsBar from './MessageReactionsBar.vue'
import { formatDateTime } from '@/refactoring/utils/formatters'

import type { IMessage, IReactionType, IChatMember } from '@/refactoring/modules/chat/types/IChat'

interface Props {
    message: IMessage
    reactionTypes?: IReactionType[]
    currentUserId?: string | null
    currentUserName?: string | null
    chatMembers?: IChatMember[]
}

interface Emits {
    (event: 'change-reaction', messageId: number, reactionId: number): void
    (event: 'remove-my-reaction', messageId: number): void
    (event: 'edit-message', messageId: number): void
    (event: 'delete-message', messageId: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const showActions = ref(false)

const isMine = computed((): boolean => {
    if (!props.currentUserId) return false

    const messageUserId = props.message.author_id || props.message.user_id || props.message.author
    return String(messageUserId) === String(props.currentUserId)
})

const safeContent = computed((): string => {
    if (!props.message.content) return ''

    return DOMPurify.sanitize(props.message.content, {
        ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'br', 'p'],
        ALLOWED_ATTR: [],
    })
})

const groupedReactions = computed(() => {
    if (!props.message.reactions || !props.reactionTypes) return []

    const groups: Record<number, any> = {}

    props.message.reactions.forEach((reaction) => {
        const typeId = reaction.reaction_type_id
        if (!groups[typeId]) {
            const reactionType = props.reactionTypes?.find((rt) => rt.id === typeId)
            groups[typeId] = {
                id: typeId,
                emoji: reactionType?.emoji || '👍',
                name: reactionType?.name || 'like',
                count: 0,
                users: [],
                hasMyReaction: false,
            }
        }

        groups[typeId].count++
        groups[typeId].users.push(reaction.user)

        if (String(reaction.user_id) === String(props.currentUserId)) {
            groups[typeId].hasMyReaction = true
        }
    })

    return Object.values(groups)
})

const hasMyReaction = computed((): boolean => {
    return groupedReactions.value.some((group: any) => group.hasMyReaction)
})

const formatTime = (timestamp: string): string => {
    try {
        return new Date(timestamp).toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit',
        })
    } catch {
        return ''
    }
}

const toggleReaction = (): void => {
    if (!props.reactionTypes?.length) return

    const defaultReactionId = props.reactionTypes[0].id

    if (hasMyReaction.value) {
        emit('remove-my-reaction', props.message.id)
    } else {
        emit('change-reaction', props.message.id, defaultReactionId)
    }
}

const handleReactionClick = (reactionId: number): void => {
    const group = groupedReactions.value.find((g: any) => g.id === reactionId)

    if (group?.hasMyReaction) {
        emit('remove-my-reaction', props.message.id)
    } else {
        emit('change-reaction', props.message.id, reactionId)
    }
}

const editMessage = (): void => {
    emit('edit-message', props.message.id)
}

const deleteMessage = (): void => {
    emit('delete-message', props.message.id)
}
</script>

<style scoped>
.message {
    @apply relative;
}

.message--mine {
    @apply flex justify-end;
}

.message--mine .message-bubble {
    @apply bg-blue-500 text-white;
}

.message--theirs .message-bubble {
    @apply bg-white text-gray-800 border border-gray-200;
}

.message-bubble {
    @apply rounded-2xl max-w-md break-words;
}

.message-actions {
    z-index: 10;
}

.text {
    @apply leading-relaxed;
}

.text :deep(p) {
    @apply mb-2 last:mb-0;
}

.text :deep(br) {
    @apply leading-relaxed;
}
</style>
