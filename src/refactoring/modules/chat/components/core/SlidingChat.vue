<template>
    <div class="chat-sliding-wrapper">
        <Dialog
            v-model:visible="isVisible"
            modal
            :header="headerTitle"
            :style="{ width: '95vw', maxWidth: '1200px', height: '85vh' }"
            :breakpoints="{ '960px': '95vw', '640px': '90vw' }"
            class="chat-dialog"
            :closable="true"
            :modal="true"
            :dismiss-label="'Закрыть'"
            @hide="handleDialogHide"
        >
            <div
                class="chat-content h-full flex gap-4 flex-wrap md:flex-nowrap relative overflow-hidden"
            >
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

                <section
                    class="w-full flex flex-col overflow-hidden bg-white rounded-lg"
                    :class="mobileChatClass"
                >
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
                        id="sliding-chat-messages"
                        ref="messagesContainer"
                        class="flex-1 overflow-y-auto py-4 px-6 bg-gray-50 flex flex-col gap-1"
                    >
                        <template v-if="chatStore.currentChat">
                            <template v-if="chatStore.isLoadingMessages">
                                <MessagesSkeletonGroup :count="4" />
                            </template>
                            <template v-else>
                                <template v-for="group in groupedMessages" :key="group.key">
                                    <div class="text-center text-sm text-gray-500 my-2 select-none">
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
                                    />
                                </template>
                            </template>
                        </template>
                        <template v-else>
                            <div class="h-full flex items-center justify-center text-gray-500">
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
                <MembersListModal
                    v-model:visible="showMembersDialog"
                    :chat="chatStore.currentChat"
                />
            </div>
        </Dialog>
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'

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

import type { IChat, IEmployee } from '@/refactoring/modules/chat/types/IChat'

interface Props {
    visible: boolean
    userId?: string | null
    chatId?: number | null
}

interface Emits {
    (event: 'update:visible', value: boolean): void
    (event: 'chat-opened', chat: IChat): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const chatStore = useChatStore()
const membersStore = useMembersStore()
const realtimeStore = useRealtimeStore()
const currentUser = useCurrentUser()
const fb = useFeedbackStore()

const messagesContainer = ref<HTMLElement | null>(null)
const isMobile = ref(false)
const mobileView = ref<'list' | 'chat'>('list')

const showCreate = ref(false)
const showInviteDialog = ref(false)
const showManageDialog = ref(false)
const showMembersDialog = ref(false)

let mediaQueryList: MediaQueryList | null = null

const updateIsMobile = () => {
    if (mediaQueryList) {
        isMobile.value = mediaQueryList.matches
    }
}

const isVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
})

const headerTitle = computed(() => {
    if (chatStore.currentChat) {
        return chatStore.currentChat.title
    }
    return 'Чат'
})

const mobileAsideClass = computed(() =>
    isMobile.value ? (mobileView.value === 'list' ? 'block w-full' : 'hidden') : 'w-80 min-w-80',
)

const mobileChatClass = computed(() =>
    isMobile.value ? (mobileView.value === 'chat' ? 'block w-full' : 'hidden') : 'flex-1',
)

const groupedMessages = computed(() => {
    if (!chatStore.messages.length) return []

    const groups: Record<string, any[]> = {}

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

const scrollToBottom = (): void => {
    nextTick(() => {
        const container = messagesContainer.value
        if (container) {
            container.scrollTop = container.scrollHeight
        }
    })
}

const handleDialogHide = (): void => {
    isVisible.value = false
}

const openChatFromList = async (chat: IChat): Promise<void> => {
    try {
        await chatStore.openChat(chat)
        mobileView.value = 'chat'
        emit('chat-opened', chat)
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
        emit('chat-opened', chat)
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
        scrollToBottom()
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
        emit('chat-opened', chat)
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

const onChatUpdated = (updatedChat: IChat): void => {
    if (chatStore.currentChat?.id === updatedChat.id) {
        chatStore.currentChat = updatedChat
    }
}

const initializeChat = async (): Promise<void> => {
    try {
        // Initialize chat data and real-time connections
        await Promise.all([
            chatStore.initializeOnce(),
            membersStore.fetchInvitations(),
            realtimeStore.initialize(),
        ])

        if (props.userId) {
            const chat = await chatStore.createDialog(props.userId)
            await openChatFromList(chat)
        } else if (props.chatId) {
            await chatStore.openChatById(props.chatId)
            mobileView.value = 'chat'
        }
    } catch (error) {
        fb.showToast({
            type: 'error',
            title: 'Ошибка инициализации',
            message: 'Не удалось инициализировать чат',
        })
    }
}

onMounted(async () => {
    if (window.matchMedia) {
        mediaQueryList = window.matchMedia('(max-width: 768px)')
        updateIsMobile()
        mediaQueryList.addEventListener('change', updateIsMobile)
    }

    await initializeChat()
})

onUnmounted(() => {
    if (mediaQueryList) {
        mediaQueryList.removeEventListener('change', updateIsMobile)
    }
})

watch(
    () => [props.chatId, props.userId, props.visible],
    async ([newChatId, newUserId, visible]) => {
        if (!visible) return

        if (newUserId && newUserId !== props.userId) {
            const chat = await chatStore.createDialog(newUserId)
            await openChatFromList(chat)
        } else if (newChatId && newChatId !== props.chatId) {
            await chatStore.openChatById(newChatId)
            mobileView.value = 'chat'
        }
    },
)

watch(
    () => chatStore.messages.length,
    () => scrollToBottom(),
)
</script>

<style scoped>
.chat-sliding-wrapper {
    z-index: 9999;
}

.chat-dialog {
    z-index: 10000;
}

.chat-content {
    height: calc(85vh - 80px);
}

@media (max-width: 768px) {
    .chat-content {
        flex-direction: column;
        height: calc(85vh - 60px);
    }
}
</style>
