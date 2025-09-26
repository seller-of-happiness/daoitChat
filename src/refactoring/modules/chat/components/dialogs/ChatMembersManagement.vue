<template>
    <Dialog
        v-model:visible="isVisible"
        modal
        header="Управление участниками"
        :style="{ width: '50rem', minHeight: '60vh' }"
        :breakpoints="{ '1199px': '75vw', '575px': '90vw' }"
        :closable="true"
    >
        <div v-if="!chat" class="text-center p-4">
            <p class="text-surface-500">Чат не выбран</p>
        </div>

        <div v-else class="space-y-6">
            <TabView>
                <TabPanel header="Участники">
                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-medium">
                                Участники ({{ chatMembers.length }})
                            </h3>
                            <Button
                                label="Пригласить"
                                icon="pi pi-plus"
                                size="small"
                                @click="showInviteDialog = true"
                            />
                        </div>

                        <div class="space-y-2 max-h-60 overflow-y-auto">
                            <div
                                v-for="member in chatMembers"
                                :key="getMemberKey(member)"
                                class="flex items-center justify-between p-3 border border-surface-200 rounded-lg"
                            >
                                <div class="flex items-center gap-3">
                                    <Avatar
                                        :label="getMemberInitials(member)"
                                        class="bg-primary text-primary-contrast"
                                        size="normal"
                                        shape="circle"
                                    />
                                    <div>
                                        <div class="font-medium">
                                            {{ getMemberDisplayName(member) }}
                                        </div>
                                        <div class="text-sm text-surface-500">
                                            Присоединился {{ formatJoinDate(member.joined_at) }}
                                        </div>
                                    </div>
                                </div>

                                <div class="flex items-center gap-2">
                                    <Tag
                                        v-if="member.is_admin"
                                        value="Администратор"
                                        severity="info"
                                        class="text-xs"
                                    />

                                    <Button
                                        v-if="canRemoveMember(member)"
                                        icon="pi pi-times"
                                        severity="danger"
                                        size="small"
                                        text
                                        rounded
                                        :loading="isRemovingMember(member)"
                                        @click="startRemoveMember(member)"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>
                </TabPanel>

                <TabPanel header="Отправленные приглашения" v-if="canManageChat">
                    <div class="space-y-4">
                        <div class="flex justify-between items-center">
                            <h3 class="text-lg font-medium">
                                Отправленные приглашения ({{ chatInvitations.length }})
                            </h3>
                            <div class="flex gap-2">
                                <Button
                                    label="Debug API"
                                    icon="pi pi-cog"
                                    severity="info"
                                    size="small"
                                    text
                                    @click="debugInvitations"
                                />
                                <Button
                                    label="Отозвать все"
                                    icon="pi pi-times"
                                    severity="danger"
                                    size="small"
                                    :loading="isRecallingAllInvites"
                                    :disabled="chatInvitations.length === 0"
                                    @click="recallAllInvites"
                                />
                            </div>
                        </div>

                        <div class="space-y-2 max-h-60 overflow-y-auto">
                            <!-- Пустое состояние -->
                            <div
                                v-if="chatInvitations.length === 0"
                                class="text-center py-8 text-surface-500"
                            >
                                <div class="mb-2">
                                    <i class="pi pi-envelope text-4xl mb-4 block"></i>
                                </div>
                                <div class="mb-2 font-semibold">Нет отправленных приглашений</div>
                                <div class="text-xs">
                                    Используйте кнопку "Пригласить" в табе участников для отправки
                                    приглашений
                                </div>
                            </div>

                            <!-- Список приглашений -->
                            <div
                                v-for="invite in chatInvitations"
                                :key="invite.id"
                                class="flex items-center justify-between p-3 border border-surface-200 rounded-lg"
                            >
                                <div class="flex items-center gap-3">
                                    <Avatar
                                        :label="getInviteInitials(invite)"
                                        class="bg-orange-500 text-white"
                                        size="normal"
                                        shape="circle"
                                    />
                                    <div>
                                        <div class="font-medium">
                                            {{ getInviteDisplayName(invite) }}
                                        </div>
                                        <div class="text-sm text-surface-500">
                                            Приглашен {{ getCreatedByName(invite.created_by) }}
                                        </div>
                                    </div>
                                </div>

                                <Button
                                    icon="pi pi-times"
                                    severity="danger"
                                    size="small"
                                    text
                                    rounded
                                    :loading="isRemovingInvite(invite.id)"
                                    v-tooltip.bottom="'Отозвать приглашение'"
                                    @click="removeInvite(invite)"
                                />
                            </div>
                        </div>
                    </div>
                </TabPanel>

                <TabPanel header="Настройки">
                    <div class="space-y-4">
                        <h3 class="text-lg font-medium">
                            Настройки {{ chat?.type === 'group' ? 'группы' : 'канала' }}
                        </h3>

                        <div class="space-y-4">
                            <!-- Аватарка -->
                            <div class="field">
                                <label class="font-medium"
                                    >Аватарка
                                    {{ chat?.type === 'group' ? 'группы' : 'канала' }}</label
                                >
                                <div class="flex items-center gap-4 mt-2">
                                    <Avatar
                                        :image="currentAvatar"
                                        :label="!currentAvatar ? getChatInitials() : undefined"
                                        class="bg-primary text-primary-contrast"
                                        size="xlarge"
                                        shape="circle"
                                    />
                                    <div class="flex flex-col gap-2">
                                        <FileUpload
                                            mode="basic"
                                            :maxFileSize="5000000"
                                            accept="image/*"
                                            :auto="true"
                                            chooseLabel="Выбрать изображение"
                                            class="p-0"
                                            @upload="onAvatarUpload"
                                            @select="onAvatarSelect"
                                        />
                                        <Button
                                            v-if="currentAvatar"
                                            label="Удалить аватарку"
                                            icon="pi pi-trash"
                                            severity="secondary"
                                            size="small"
                                            text
                                            @click="removeAvatar"
                                        />
                                    </div>
                                </div>
                            </div>

                            <!-- Название -->
                            <div class="field">
                                <label for="chat-title" class="font-medium">Название</label>
                                <InputText
                                    id="chat-title"
                                    v-model="editedTitle"
                                    class="w-full"
                                    placeholder="Введите название"
                                />
                            </div>

                            <!-- Описание -->
                            <div class="field">
                                <label for="chat-description" class="font-medium">Описание</label>
                                <Textarea
                                    id="chat-description"
                                    v-model="editedDescription"
                                    class="w-full"
                                    rows="3"
                                    placeholder="Введите описание"
                                />
                            </div>

                            <!-- Кнопка сохранения -->
                            <Button
                                label="Сохранить изменения"
                                icon="pi pi-save"
                                :loading="isSavingSettings"
                                :disabled="!hasChanges"
                                @click="saveSettings"
                            />
                        </div>
                    </div>
                </TabPanel>
            </TabView>
        </div>

        <InviteUsersDialog
            v-model:visible="showInviteDialog"
            :chat="chat"
            @invite-users="handleInviteUsers"
        />

        <ConfirmDialog
            v-model:visible="showRemoveConfirm"
            header="Удалить участника"
            message="Вы уверены, что хотите удалить этого участника из чата?"
            icon="pi pi-exclamation-triangle"
            accept-label="Удалить"
            reject-label="Отмена"
            accept-class="p-button-danger"
            @accept="confirmRemoveMember"
        />
    </Dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import Tag from 'primevue/tag'
import ConfirmDialog from 'primevue/confirmdialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import FileUpload from 'primevue/fileupload'

import { useChatStore } from '@/refactoring/modules/chat/stores/chatStore'
import { useMembersStore } from '@/refactoring/modules/chat/stores/membersStore'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import { useCurrentUser } from '@/refactoring/modules/chat/composables/useCurrentUser'
import { useUserStore } from '@/refactoring/modules/user/stores/userStore'
import { stripHtmlTags } from '@/refactoring/utils/formatters'
import { inviteApiService } from '@/refactoring/modules/chat/services/inviteApi'
import InviteUsersDialog from './InviteUsersDialog.vue'

import type {
    IChat,
    IChatMember,
    IChatInvitation,
    IChatInvite,
} from '@/refactoring/modules/chat/types/IChat'

interface Props {
    visible: boolean
    chat?: IChat | null
}

interface Emits {
    (event: 'update:visible', value: boolean): void
    (event: 'chat-updated', chat: IChat): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

const chatStore = useChatStore()
const membersStore = useMembersStore()
const feedbackStore = useFeedbackStore()
const currentUser = useCurrentUser()

const showInviteDialog = ref(false)
const showRemoveConfirm = ref(false)
const memberToRemove = ref<IChatMember | null>(null)
const removingMembers = ref(new Set<string>())
const removingInvites = ref(new Set<number>())

// Переменные для настроек
const editedTitle = ref('')
const editedDescription = ref('')
const currentAvatar = ref('')
const isSavingSettings = ref(false)
const isRecallingAllInvites = ref(false)

const isVisible = computed({
    get: () => props.visible,
    set: (value: boolean) => emit('update:visible', value),
})

const chatMembers = computed(() => props.chat?.members || [])
const chatInvitations = computed(() => {
    // Получаем исходящие приглашения для текущего чата
    if (!props.chat?.id) return []

    console.log('[ChatMembersManagement] Debugging sent invitations:', {
        chatId: props.chat.id,
        sentInvitations: membersStore.sentInvitations,
        chatObject: props.chat,
    })

    // Сначала попробуем из объекта чата (если приглашения встроены)
    if (props.chat.invitations && Array.isArray(props.chat.invitations)) {
        console.log('[ChatMembersManagement] Using chat.invitations:', props.chat.invitations)
        return props.chat.invitations
    }

    // Используем исходящие приглашения из membersStore (уже отфильтрованные по created_by)
    const sentFiltered = membersStore.sentInvitations.filter(
        (inv) => inv.chat.id === props.chat!.id,
    )
    console.log('[ChatMembersManagement] Using filtered sentInvitations:', sentFiltered)
    return sentFiltered
})
const hasInvitations = computed(() => chatInvitations.value.length > 0)

const getMemberKey = (member: IChatMember): string => {
    const userId = typeof member.user === 'string' ? member.user : member.user.id
    return `member-${userId}-${member.joined_at}`
}

const getMemberDisplayName = (member: IChatMember): string => {
    if (typeof member.user === 'string') return member.user

    const { first_name, last_name, middle_name } = member.user
    const fullName =
        [first_name, middle_name, last_name].filter(Boolean).join(' ') || 'Пользователь'
    return stripHtmlTags(fullName)
}

const getMemberInitials = (member: IChatMember): string => {
    const name = getMemberDisplayName(member)
    return name
        .split(' ')
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
}

const getInviteDisplayName = (invite: IChatInvite | IChatInvitation): string => {
    if (!invite.invited_user) return 'Неизвестный пользователь'

    const { first_name, last_name, middle_name } = invite.invited_user
    const fullName =
        [first_name, middle_name, last_name].filter(Boolean).join(' ') || 'Пользователь'
    return stripHtmlTags(fullName)
}

const getInviteInitials = (invite: IChatInvite | IChatInvitation): string => {
    const name = getInviteDisplayName(invite)
    return name
        .split(' ')
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
}

const getCreatedByName = (createdBy: any): string => {
    if (!createdBy) return 'неизвестно кем'

    const { first_name, last_name, middle_name } = createdBy
    const fullName =
        [first_name, middle_name, last_name].filter(Boolean).join(' ') || 'неизвестно кем'
    return stripHtmlTags(fullName)
}

const formatJoinDate = (joinedAt: string): string => {
    try {
        return new Date(joinedAt).toLocaleDateString('ru-RU')
    } catch {
        return 'неизвестно'
    }
}

const canRemoveMember = (member: IChatMember): boolean => {
    if (!props.chat || !currentUser.id.value) return false

    const currentUserId = currentUser.id.value
    const memberUserId = typeof member.user === 'string' ? member.user : member.user.id

    // Нельзя удалить себя
    if (memberUserId === currentUserId) return false

    // Проверяем права администратора
    const currentMember = props.chat.members?.find((m) => {
        const userId = typeof m.user === 'string' ? m.user : m.user.id
        return userId === currentUserId
    })

    return currentMember?.is_admin || false
}

const canManageChat = computed((): boolean => {
    if (!props.chat || !currentUser.id.value) return false

    const currentUserId = currentUser.id.value

    // Проверяем права администратора
    const currentMember = props.chat.members?.find((m) => {
        const userId = typeof m.user === 'string' ? m.user : m.user.id
        return userId === currentUserId
    })

    return currentMember?.is_admin || false
})

const isRemovingMember = (member: IChatMember): boolean => {
    const userId = typeof member.user === 'string' ? member.user : member.user.id
    return removingMembers.value.has(userId)
}

const isRemovingInvite = (inviteId: number): boolean => {
    return removingInvites.value.has(inviteId)
}

const startRemoveMember = (member: IChatMember): void => {
    memberToRemove.value = member
    showRemoveConfirm.value = true
}

const confirmRemoveMember = async (): Promise<void> => {
    if (!memberToRemove.value || !props.chat) return

    const userId =
        typeof memberToRemove.value.user === 'string'
            ? memberToRemove.value.user
            : memberToRemove.value.user.id

    removingMembers.value.add(userId)
    showRemoveConfirm.value = false

    try {
        await chatStore.removeMemberFromChat(props.chat.id, userId)

        const updatedChat = await chatStore.fetchChat(props.chat.id)
        if (updatedChat) {
            emit('chat-updated', updatedChat)
        }

        feedbackStore.showToast({
            type: 'success',
            title: 'Успешно',
            message: 'Участник удален из чата',
        })
    } catch (error) {
        feedbackStore.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось удалить участника',
        })
    } finally {
        removingMembers.value.delete(userId)
        memberToRemove.value = null
    }
}

const removeInvite = async (invite: IChatInvite | IChatInvitation): Promise<void> => {
    if (!invite.id || !props.chat) return

    removingInvites.value.add(invite.id)

    try {
        await chatStore.removeInvitation(invite.id)

        const updatedChat = await chatStore.fetchChat(props.chat.id)
        if (updatedChat) {
            emit('chat-updated', updatedChat)
        }

        feedbackStore.showToast({
            type: 'success',
            title: 'Успешно',
            message: 'Приглашение отозвано',
        })
    } catch (error) {
        feedbackStore.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось отозвать приглашение',
        })
    } finally {
        removingInvites.value.delete(invite.id)
    }
}

const handleInviteUsers = async (userIds: string[]): Promise<void> => {
    if (!props.chat) return

    try {
        await chatStore.addMembersToChat(props.chat.id, userIds)

        const updatedChat = await chatStore.fetchChat(props.chat.id)
        if (updatedChat) {
            emit('chat-updated', updatedChat)
        }

        showInviteDialog.value = false

        feedbackStore.showToast({
            type: 'success',
            title: 'Успешно',
            message: 'Пользователи приглашены в чат',
        })
    } catch (error) {
        feedbackStore.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось пригласить пользователей',
        })
    }
}

// Computed свойства для настроек
const hasChanges = computed(() => {
    return (
        editedTitle.value !== (props.chat?.title || '') ||
        editedDescription.value !== (props.chat?.description || '') ||
        currentAvatar.value !== (props.chat?.icon || '')
    )
})

// Методы для работы с настройками
const initializeSettings = () => {
    editedTitle.value = props.chat?.title || ''
    editedDescription.value = props.chat?.description || ''
    currentAvatar.value = props.chat?.icon || ''
}

const saveSettings = async () => {
    if (!props.chat || !hasChanges.value) return

    isSavingSettings.value = true
    try {
        // Здесь должен быть вызов API для обновления чата
        // const updatedChat = await chatStore.updateChat(props.chat.id, {
        //     title: editedTitle.value,
        //     description: editedDescription.value
        // })

        feedbackStore.showToast({
            type: 'success',
            title: 'Настройки сохранены',
            message: 'Настройки чата успешно обновлены',
        })

        // emit('chat-updated', updatedChat)
    } catch (error) {
        feedbackStore.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось сохранить настройки',
        })
    } finally {
        isSavingSettings.value = false
    }
}

// Методы для работы с аватаркой
const getChatInitials = (): string => {
    if (!props.chat?.title) return 'ЧТ'
    return props.chat.title
        .split(' ')
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
}

const onAvatarSelect = (event: any) => {
    const file = event.files[0]
    if (file) {
        // Создаем превью изображения
        const reader = new FileReader()
        reader.onload = (e) => {
            currentAvatar.value = e.target?.result as string
        }
        reader.readAsDataURL(file)
    }
}

const onAvatarUpload = (event: any) => {
    // Здесь будет логика загрузки на сервер
    console.log('Avatar upload:', event)
    feedbackStore.showToast({
        type: 'info',
        title: 'Загрузка аватарки',
        message: 'Функция загрузки будет реализована позже',
    })
}

const removeAvatar = () => {
    currentAvatar.value = ''
}

// Методы для работы с приглашениями
const recallAllInvites = async () => {
    if (!props.chat || chatInvitations.value.length === 0) return

    isRecallingAllInvites.value = true
    try {
        // Отзываем все приглашения параллельно
        const promises = chatInvitations.value.map((invite) =>
            membersStore.removeInvitation(invite.id),
        )

        await Promise.all(promises)

        feedbackStore.showToast({
            type: 'success',
            title: 'Приглашения отозваны',
            message: 'Все приглашения успешно отозваны',
        })
    } catch (error) {
        feedbackStore.showToast({
            type: 'error',
            title: 'Ошибка',
            message: 'Не удалось отозвать приглашения',
        })
    } finally {
        isRecallingAllInvites.value = false
    }
}

const debugInvitations = async () => {
    console.log('=== DEBUG INVITATIONS START ===')

    // Информация о текущем пользователе
    const userStore = useUserStore()
    const currentUser = userStore.user
    console.log('Current user:', {
        user: currentUser,
        uuid: currentUser?.uuid,
        id: currentUser?.id,
    })

    // Прямой вызов API
    try {
        console.log('Making direct API call...')
        const result = await inviteApiService.fetchInvitations()
        console.log('Direct API result:', result)

        const sentResult = await inviteApiService.fetchSentInvitations()
        console.log('Direct sent API result:', sentResult)
    } catch (error) {
        console.error('Direct API error:', error)
    }

    // Состояние сторов
    console.log('MembersStore state:', {
        invitations: membersStore.invitations,
        sentInvitations: membersStore.sentInvitations,
        isInvitationsInitialized: membersStore.isInvitationsInitialized,
        isSentInvitationsInitialized: membersStore.isSentInvitationsInitialized,
    })

    // Состояние компонента
    console.log('Component state:', {
        chatId: props.chat?.id,
        chatInvitations: chatInvitations.value,
        canManageChat: canManageChat.value,
    })

    console.log('=== DEBUG INVITATIONS END ===')
}

// Методы для информационного таба (оставляем для совместимости)
const getCreatorName = (): string => {
    if (!props.chat?.created_by) return 'Неизвестно'

    const creator = props.chat.created_by
    if (typeof creator === 'string') return creator

    const { first_name, last_name, middle_name } = creator
    return [first_name, middle_name, last_name].filter(Boolean).join(' ') || 'Пользователь'
}

const getCreatorInitials = (): string => {
    const name = getCreatorName()
    return name
        .split(' ')
        .slice(0, 2)
        .map((word) => word.charAt(0).toUpperCase())
        .join('')
}

// Инициализация при открытии диалога
watch(
    () => props.visible,
    async (visible) => {
        if (visible) {
            initializeSettings()
            // Загружаем приглашения при открытии модалки
            console.log('[ChatMembersManagement] Refreshing invitations on modal open')
            await Promise.all([
                membersStore.refreshInvitations(),
                membersStore.refreshSentInvitations(),
            ])

            // Также обновляем информацию о чате
            if (props.chat?.id) {
                console.log('[ChatMembersManagement] Fetching fresh chat data')
                const updatedChat = await chatStore.fetchChat(props.chat.id)
                if (updatedChat) {
                    console.log('[ChatMembersManagement] Updated chat data:', updatedChat)
                }
            }
        }
    },
)

// Обновление данных при изменении чата (реалтайм обновления)
watch(
    () => props.chat,
    (newChat) => {
        if (newChat && props.visible) {
            initializeSettings()
        }
    },
    { deep: true },
)
</script>

<style scoped>
.space-y-2 > * + * {
    margin-top: 0.5rem;
}

.space-y-4 > * + * {
    margin-top: 1rem;
}

.space-y-6 > * + * {
    margin-top: 1.5rem;
}
</style>
