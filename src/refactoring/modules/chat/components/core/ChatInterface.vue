<template>
    <div class="flex gap-4 h-[calc(100vh-8rem)] flex-wrap md:flex-nowrap relative overflow-hidden">
        <ChatSidebar
            :chats="chatStore.chats"
            :current-chat-id="chatStore.currentChat?.id || null"
            :search-results="chatStore.searchResults"
            :is-searching="chatStore.isSearching"
            :is-loading-chats="chatStore.isLoadingChats"
            :invitations="membersStore.invitations"
            :mobile-class="mobileAsideClass"
            @select-chat="openChatFromList"
            @create-chat="showCreate = true"
            @create-dialog="createNewDialog"
            @search="performSearch"
            @clear-search="clearSearch"
            @accept-invitation="acceptInvitation"
            @decline-invitation="declineInvitation"
        />

        <section class="w-full card p-0 flex flex-col overflow-hidden" :class="mobileChatClass">
            <ChatHeader
                :current-chat="chatStore.currentChat"
                :is-mobile="isMobile"
                :mobile-view="mobileView"
                @back-to-list="mobileView = 'list'"
                @invite-users="showInviteDialog = true"
                @manage-chat="showManageDialog = true"
                @show-members="showMembersDialog = true"
            />

            <div
                id="chat-messages"
                ref="messagesContainer"
                class="flex-1 overflow-y-auto py-4 px-10 bg-surface-50 dark:bg-surface-900/40 flex flex-col gap-1"
            >
                <template v-if="chatStore.currentChat">
                    <template v-if="chatStore.isLoadingMessages">
                        <MessagesSkeletonGroup :count="6" />
                    </template>
                    <template v-else>
                        <template v-for="group in groupedMessages" :key="group.key">
                            <div class="text-center text-sm text-surface-500 my-2 select-none">
                                {{ group.label }}
                            </div>
                            <MessageItem
                                v-for="message in group.items"
                                :key="`${message.id}-${message.reaction_updated_at || message.updated_at || message.created_at}`"
                                :message="message"
                                :reaction-types="chatStore.reactionTypes"
                                :current-user-id="currentUser.id.value"
                                :current-user-name="currentUser.nameForChat.value"
                                :chat-members="transformedChatMembers"
                                @change-reaction="changeReaction"
                                @remove-my-reaction="removeMyReaction"
                                @edit-message="editMessage"
                                @delete-message="deleteMessage"
                            />
                        </template>
                    </template>
                </template>
                <template v-else>
                    <div class="h-full flex items-center justify-center text-surface-500">
                        Выберите чат слева
                    </div>
                </template>
            </div>

            <ChatInput
                :current-chat="chatStore.currentChat"
                :is-sending="chatStore.isSending"
                @send-message="sendMessage"
            />
        </section>

        <ChatCreateDialog v-model:visible="showCreate" @create="createChat" />
        <InviteUsersDialog
            v-model:visible="showInviteDialog"
            :chat="chatStore.currentChat"
            @invite-users="inviteUsers"
        />
        <ChatMembersManagement
            v-model:visible="showManageDialog"
            :chat="chatStore.currentChat"
            @chat-updated="onChatUpdated"
        />
        <MembersListModal v-model:visible="showMembersDialog" :chat="chatStore.currentChat" />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch, nextTick } from 'vue'
import { useChatStore } from '@/refactoring/modules/chat/stores/chatStore'
import { useMembersStore } from '@/refactoring/modules/chat/stores/membersStore'
import { useRealtimeStore } from '@/refactoring/modules/chat/stores/realtimeStore'
import { useCurrentUser } from '@/refactoring/modules/chat/composables/useCurrentUser'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import { formatDateOnly } from '@/refactoring/utils/formatters'

import ChatSidebar from './ChatSidebar.vue'
import ChatHeader from './ChatHeader.vue'
import ChatInput from './ChatInput.vue'
import MessageItem from '../messages/MessageItem.vue'
import ChatCreateDialog from '../dialogs/ChatCreateDialog.vue'
import InviteUsersDialog from '../dialogs/InviteUsersDialog.vue'
import ChatMembersManagement from '../dialogs/ChatMembersManagement.vue'
import MembersListModal from '../dialogs/MembersListModal.vue'
import { MessagesSkeletonGroup } from '../common/skeletons'

import type {
    IChat,
    IMessage,
    IChatMember,
    IEmployee,
} from '@/refactoring/modules/chat/types/IChat'

interface Props {
    userId?: string
    initialChatId?: number | null
    initialUserId?: string | null
}

const props = defineProps<Props>()

const chatStore = useChatStore()
const membersStore = useMembersStore()
const realtimeStore = useRealtimeStore()
const currentUser = useCurrentUser()
const fb = useFeedbackStore()

const messagesContainer = shallowRef<HTMLElement | null>(null)
const autoScroll = ref(true)
const isMobile = ref(false)
const mobileView = ref<'list' | 'chat'>('list')

const showCreate = ref(false)
const showInviteDialog = ref(false)
const showManageDialog = ref(false)
const showMembersDialog = ref(false)

let mediaQueryList: MediaQueryList | null = null

const BOTTOM_THRESHOLD_PX = 32

const updateIsMobile = () => {
    if (mediaQueryList) {
        isMobile.value = mediaQueryList.matches
    }
}

const isNearBottom = (): boolean => {
    const container = messagesContainer.value
    if (!container) return false
    const { scrollTop, scrollHeight, clientHeight } = container
    return scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD_PX
}

const scrollToBottom = (smooth = false): void => {
    nextTick(() => {
        const container = messagesContainer.value
        if (!container) return
        container.scrollTo({
            top: container.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto',
        })
    })
}

const handleScroll = (): void => {
    autoScroll.value = isNearBottom()
}

const checkAndAutoScroll = (): void => {
    if (autoScroll.value) {
        scrollToBottom()
    }
}

const mobileAsideClass = computed(() =>
    isMobile.value ? (mobileView.value === 'list' ? 'block' : 'hidden') : '',
)

const mobileChatClass = computed(() =>
    isMobile.value ? (mobileView.value === 'chat' ? 'block' : 'hidden') : '',
)

const groupedMessages = computed(() => {
    if (!chatStore.messages.length) return []

    const groups: Record<string, IMessage[]> = {}

    chatStore.messages.forEach((message) => {
        const date = formatDateOnly(message.created_at)
        if (!groups[date]) groups[date] = []
        groups[date].push(message)
    })

    return Object.entries(groups).map(([date, messages]) => ({
        key: date,
        label: date,
        items: messages,
    }))
})

const transformedChatMembers = computed(() => {
    if (!chatStore.currentChat?.members) return []

    return chatStore.currentChat.members.map((member) => ({
        user: member.user,
        is_admin: member.is_admin,
        joined_at: member.joined_at,
        user_uuid: member.user_uuid || '',
        user_name:
            typeof member.user === 'string'
                ? member.user_name || ''
                : `${member.user?.first_name || ''} ${member.user?.last_name || ''}`.trim(),
    }))
})

const openChatFromList = async (chat: IChat): Promise<void> => {
    try {
        await chatStore.openChat(chat)
        mobileView.value = 'chat'
        scrollToBottom()
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось открыть чат',
        })
    }
}

const createNewDialog = async (employee: IEmployee): Promise<void> => {
    try {
        const chat = await chatStore.createDialog(employee.id)
        await chatStore.openChat(chat)
        mobileView.value = 'chat'
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось создать диалог',
        })
    }
}

const sendMessage = async (content: string): Promise<void> => {
    if (!chatStore.currentChat) return

    try {
        await chatStore.sendMessage(chatStore.currentChat.id, content)
        checkAndAutoScroll()
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось отправить сообщение',
        })
    }
}

const createChat = async (payload: any): Promise<void> => {
    try {
        const chat = await chatStore.createChat(payload)
        await chatStore.openChat(chat)
        showCreate.value = false
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось создать чат',
        })
    }
}

const inviteUsers = async (payload: { selectedUsers: IEmployee[] }): Promise<void> => {
    if (!chatStore.currentChat) return

    try {
        const userIds = payload.selectedUsers.map((user) => user.id)
        await chatStore.addMembersToChat(chatStore.currentChat.id, userIds)
        showInviteDialog.value = false

        fb.showToast({
            type: 'success',
            title: 'Успех',
            message: 'Пользователи приглашены',
        })
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось пригласить пользователей',
        })
    }
}

const performSearch = async (query: string): Promise<void> => {
    try {
        await chatStore.searchChats(query)
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка поиска',
            message: 'Не удалось выполнить поиск',
        })
    }
}

const clearSearch = (): void => {
    chatStore.searchResults = []
    chatStore.isSearching = false
}

const acceptInvitation = async (invitation: any): Promise<void> => {
    try {
        const success = await membersStore.acceptInvitation(invitation.id)
        if (success) {
            // Refresh chats list to include the new chat
            await chatStore.fetchChats()
            fb.showToast({
                type: 'success',
                title: 'Приглашение принято',
                message: 'Вы присоединились к чату',
            })
        }
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось принять приглашение',
        })
    }
}

const declineInvitation = async (invitation: any): Promise<void> => {
    try {
        const success = await membersStore.declineInvitation(invitation.id)
        if (success) {
            fb.showToast({
                type: 'info',
                title: 'Приглашение отклонено',
                message: 'Приглашение отклонено',
            })
        }
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось отклонить приглашение',
        })
    }
}

const changeReaction = async (messageId: number, reactionId: number): Promise<void> => {
    try {
        await chatStore.addReaction(messageId, reactionId)
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось добавить реакцию',
        })
    }
}

const removeMyReaction = async (messageId: number): Promise<void> => {
    try {
        await chatStore.clearMyReactions(messageId)
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось удалить реакцию',
        })
    }
}

const editMessage = async (messageId: number): Promise<void> => {
    if (!chatStore.currentChat) return

    try {
        const message = chatStore.messages.find((m) => m.id === messageId)
        if (!message) return

        const newContent = prompt('Редактировать сообщение:', message.content)
        if (newContent === null || newContent.trim() === '') return

        await chatStore.updateMessage(chatStore.currentChat.id, messageId, newContent.trim())
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось отредактировать сообщение',
        })
    }
}

const deleteMessage = async (messageId: number): Promise<void> => {
    if (!chatStore.currentChat) return

    try {
        const confirmed = confirm('Вы уверены, что хотите удалить это сообщение?')
        if (!confirmed) return

        await chatStore.deleteMessage(chatStore.currentChat.id, messageId)
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось удалить сообщение',
        })
    }
}

const onChatUpdated = (updatedChat: IChat): void => {
    if (chatStore.currentChat?.id === updatedChat.id) {
        chatStore.currentChat = updatedChat
    }
}

onMounted(async () => {
    try {
        // Initialize chat data and real-time connections
        await Promise.all([
            chatStore.initializeOnce(),
            membersStore.fetchInvitations(),
            realtimeStore.initialize(),
        ])

        if (props.userId) {
            const chat = await chatStore.createDialog(props.userId)
            await chatStore.openChat(chat)
            mobileView.value = 'chat'
        } else if (props.initialChatId) {
            await chatStore.openChatById(props.initialChatId)
            mobileView.value = 'chat'
        } else {
            // Попытка восстановить последний выбранный чат из localStorage
            try {
                const savedId = Number(localStorage.getItem('selectedChatId') || '')
                if (savedId && !Number.isNaN(savedId)) {
                    // Сначала проверяем есть ли чат в загруженном списке
                    const savedChat = chatStore.chats.find((c) => c.id === savedId)
                    if (savedChat) {
                        await chatStore.openChat(savedChat)
                        mobileView.value = 'chat'
                    } else {
                        // Если чат не найден в списке, попробуем открыть по ID
                        try {
                            await chatStore.openChatById(savedId)
                            mobileView.value = 'chat'
                        } catch (error) {
                            // Не удалось открыть сохраненный чат, очищаем localStorage
                            localStorage.removeItem('selectedChatId')
                        }
                    }
                }
            } catch (e) {
                // Игнорируем ошибки localStorage
            }
        }

        if (window.matchMedia) {
            mediaQueryList = window.matchMedia('(max-width: 768px)')
            updateIsMobile()
            mediaQueryList.addEventListener('change', updateIsMobile)
        }

        if (messagesContainer.value) {
            messagesContainer.value.addEventListener('scroll', handleScroll)
            scrollToBottom()
        }
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка инициализации',
            message: 'Не удалось инициализировать чат',
        })
    }
})

onUnmounted(() => {
    if (mediaQueryList) {
        mediaQueryList.removeEventListener('change', updateIsMobile)
    }

    if (messagesContainer.value) {
        messagesContainer.value.removeEventListener('scroll', handleScroll)
    }
})

watch(
    () => chatStore.messages.length,
    (newLength: number, oldLength: number) => {
        if (newLength > oldLength) {
            checkAndAutoScroll()
        }
    },
)

watch(
    () => chatStore.currentChat,
    () => {
        nextTick(() => scrollToBottom())
    },
)
</script>
