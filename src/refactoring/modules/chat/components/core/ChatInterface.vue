<template>
    <div class="flex gap-4 h-[calc(100vh-8rem)] flex-wrap md:flex-nowrap relative overflow-hidden">
        <!-- Боковая панель -->
        <ChatSidebar
            :chats="chat.chats.value"
            :current-chat-id="chat.currentChat.value?.id || null"
            :search-results="chat.searchResults.value"
            :is-searching="chat.isSearching.value"
            :is-loading-chats="chat.isLoadingChats.value"
            :invitations="chat.invitations.value"
            :mobile-class="mobileAsideClass"
            @select-chat="openChatFromList"
            @create-chat="showCreate = true"
            @create-dialog="createNewDialog"
            @search="performSearch"
            @clear-search="clearSearch"
            @accept-invitation="acceptInvitation"
            @decline-invitation="declineInvitation"
        />

        <!-- Основная область чата -->
        <section class="w-full card p-0 flex flex-col overflow-hidden" :class="mobileChatClass">
            <!-- Заголовок чата -->
            <ChatHeader
                :current-chat="chat.currentChat.value"
                :is-mobile="isMobile"
                :mobile-view="mobileView"
                @back-to-list="mobileView = 'list'"
                @invite-users="showInviteDialog = true"
                @manage-chat="showManageDialog = true"
                @show-members="showMembersDialog = true"
                @debug-websocket="debugWebSocket"
            />

            <!-- Область сообщений -->
            <div
                id="chat-messages"
                ref="messagesContainer"
                class="flex-1 overflow-y-auto py-4 px-10 bg-surface-50 dark:bg-surface-900/40 flex flex-col gap-1"
            >
                <template v-if="chat.currentChat.value">
                    <!-- Показываем скелетоны во время загрузки -->
                    <template v-if="chat.isLoadingMessages.value">
                        <MessagesSkeletonGroup :count="6" />
                    </template>
                    
                    <!-- Показываем реальные сообщения после загрузки -->
                    <template v-else>
                        <template v-for="group in groupedMessages" :key="group.key">
                            <div class="text-center text-sm text-surface-500 my-2 select-none">
                                {{ group.label }}
                            </div>
                            <MessageItem
                                v-for="message in group.items"
                                :key="`${message.id}-${message.reaction_updated_at || message.updated_at || message.created_at}`"
                                :message="message"
                                :reaction-types="chat.reactionTypes.value"
                                :current-user-id="currentUser.id.value"
                                :current-user-name="currentUser.nameForChat.value"
                                :chat-members="chat.currentChat.value?.members"
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

            <!-- Область ввода -->
            <ChatInput
                :current-chat="chat.currentChat.value"
                :is-sending="chat.isSending.value"
                @send-message="sendMessage"
            />
        </section>

        <!-- Диалог создания чата -->
        <ChatCreateDialog v-model:visible="showCreate" @create="createChat" />

        <!-- Диалог приглашения пользователей -->
        <InviteUsersDialog
            v-model:visible="showInviteDialog"
            :chat="chat.currentChat.value"
            @invite-users="inviteUsers"
        />

        <!-- Диалог управления чатом -->
        <ChatMembersManagement
            v-model:visible="showManageDialog"
            :chat="chat.currentChat.value"
            @chat-updated="onChatUpdated"
        />

        <!-- Модальное окно со списком участников -->
        <MembersListModal
            v-model:visible="showMembersDialog"
            :chat="chat.currentChat.value"
            @member-removed="onMemberRemoved"
        />

        <!-- Баннер активации звука (как в Битрикс24/Telegram) -->
        <SoundActivationBanner />
    </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useChatLogic } from '@/refactoring/modules/chat/composables/useChatLogic'
import { usePhotoSwipe } from '@/refactoring/modules/chat/composables/usePhotoSwipe'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import 'photoswipe/style.css'

import ChatSidebar from './ChatSidebar.vue'
import ChatHeader from './ChatHeader.vue'
import ChatInput from './ChatInput.vue'
import MessageItem from '../messages/MessageItem.vue'
import MessagesSkeletonGroup from '../common/skeletons/MessagesSkeletonGroup.vue'
import ChatCreateDialog from '../dialogs/ChatCreateDialog.vue'
import InviteUsersDialog from '../dialogs/InviteUsersDialog.vue'
import ChatMembersManagement from '../dialogs/ChatMembersManagement.vue'
import MembersListModal from '../dialogs/MembersListModal.vue'
import SoundActivationBanner from '../features/sound/SoundActivationBanner.vue'

import type { IChat } from '@/refactoring/modules/chat/types/IChat'

interface Props {
    userId?: string
}

const props = defineProps<Props>()

// Инициализация композабла с общей логикой чата
const chatLogic = useChatLogic({
    userId: props.userId,
    messagesContainerSelector: '#chat-messages',
})

// Получаем модуль чата напрямую для удобства
const chat = chatLogic.chat

// Инициализация галереи изображений
usePhotoSwipe({
    gallery: '#chat-messages',
    children: 'a.attachment-image-link, .attachments-only .img-wrap',
})

// Состояние компонента
const showCreate = ref(false)
const showInviteDialog = ref(false)
const showManageDialog = ref(false)
const showMembersDialog = ref(false)

// Извлекаем нужные переменные из композабла
const {
    currentUser,
    messagesContainer,
    isMobile,
    mobileView,
    groupedMessages,
    scrollToBottom,
    openChatFromList,
    performSearch,
    clearSearch,
    createNewDialog,
    sendMessage,
    createChat: createChatBase,
    inviteUsersToChat,
    changeReaction,
    removeMyReaction,
    acceptInvitation,
    declineInvitation,
    initialize,
    cleanup,
} = chatLogic

const mobileAsideClass = computed(() =>
    isMobile.value
        ? [
              'absolute',
              'inset-0',
              'z-10',
              'transform',
              'transition-transform',
              'duration-300',
              mobileView.value === 'list' ? 'translate-x-0' : '-translate-x-full',
          ]
        : [],
)

const mobileChatClass = computed(() =>
    isMobile.value
        ? [
              'absolute',
              'inset-0',
              'z-20',
              'transform',
              'transition-transform',
              'duration-300',
              mobileView.value === 'chat' ? 'translate-x-0' : 'translate-x-full',
          ]
        : [],
)

const createChat = async (payload: {
    type: 'group' | 'channel'
    title: string
    description: string
    icon: File | null
    addMembersImmediately: boolean
    selectedUsers: Array<{
        id: string
        full_name: string
        position: string | null
        department: { id: string; name: string } | null
    }>
}) => {
    try {
        const result = await createChatBase(payload)
        showCreate.value = false

        // Если есть выбранные пользователи, приглашаем их сразу после создания чата
        if (payload.addMembersImmediately && payload.selectedUsers.length > 0) {
            // Небольшая задержка чтобы чат успел загрузиться
            setTimeout(async () => {
                const userIds = payload.selectedUsers.map(user => user.id)
                await inviteUsersToChat(userIds)
            }, 300)
        } else if (payload.addMembersImmediately) {
            // Если включена опция, но пользователи не выбраны, открываем диалог приглашения
            setTimeout(() => {
                showInviteDialog.value = true
            }, 300)
        }
    } catch (error) {
        // Ошибка обрабатывается в композабле
    }
}

const inviteUsers = async (userIds: string[]) => {
    await inviteUsersToChat(userIds)
    showInviteDialog.value = false
}

// Диагностика WebSocket соединения
const debugWebSocket = async () => {
    console.log('=== ДИАГНОСТИКА WEBSOCKET ===')
    
    const connectionStatus = await chat.checkConnectionHealth()
    console.log('Состояние соединения:', connectionStatus)
    
    // Показываем в интерфейсе тоже
    const fb = useFeedbackStore()
    
    if (!connectionStatus) {
        fb.showToast({
            type: 'warning',
            title: 'WebSocket не подключен',
            message: 'Попробовать переподключение?',
            time: 10000,
        })
        
        // Предлагаем переподключиться
        setTimeout(async () => {
            try {
                await chat.forceReconnect()
            } catch (error) {
                console.error('Ошибка переподключения:', error)
            }
        }, 2000)
    } else {
        fb.showToast({
            type: 'info',
            title: 'WebSocket диагностика',
            message: 'Соединение работает корректно',
            time: 5000,
        })
    }
}

const onChatUpdated = (updatedChat: IChat) => {
    // Обновления обрабатываются автоматически через реактивную систему чат модуля
    // Метод оставлен для обратной совместимости
    console.log('Чат обновлен:', updatedChat)
}

const onMemberRemoved = async () => {
    // Обновления обрабатываются автоматически через реактивную систему чат модуля
    // Метод оставлен для обратной совместимости
    console.log('Участник удален из чата')
}

// Обработчики для редактирования и удаления сообщений
const editMessage = async (messageId: number) => {
    if (!chat.currentChat.value) return
    
    try {
        // Находим сообщение для редактирования
        const message = chat.messages.value.find(m => m.id === messageId)
        if (!message) return
        
        // Показываем prompt для редактирования
        const newContent = prompt('Редактировать сообщение:', message.content)
        if (newContent === null || newContent.trim() === '') return
        
        // Обновляем сообщение через chat модуль
        await chat.updateMessage(chat.currentChat.value.id, messageId, newContent.trim())
    } catch (error) {
        // Ошибка обрабатывается в модуле
    }
}

const deleteMessage = async (messageId: number) => {
    if (!chat.currentChat.value) return
    
    try {
        // Подтверждение удаления
        const confirmed = confirm('Вы уверены, что хотите удалить это сообщение?')
        if (!confirmed) return
        
        // Удаляем сообщение через chat модуль
        await chat.deleteMessage(chat.currentChat.value.id, messageId)
    } catch (error) {
        // Ошибка обрабатывается в модуле
    }
}

// Хуки жизненного цикла
onMounted(async () => {
    await initialize()
})

onUnmounted(() => {
    cleanup()
})
</script>
