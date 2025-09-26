/*
 * Стор для управления участниками чатов и приглашениями
 *
 * Отвечает за:
 * - Состояние приглашений в чаты
 * - Принятие/отклонение приглашений
 * - Управление участниками чатов
 * - Обработка новых приглашений из WebSocket
 */

import { defineStore } from 'pinia'
import type { IChatInvitation } from '@/refactoring/modules/chat/types/IChat'
import { inviteApiService } from '@/refactoring/modules/chat/services/inviteApi'
import { chatApiService } from '@/refactoring/modules/chat/services/chatApi'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import { useUserStore } from '@/refactoring/modules/user/stores/userStore'

interface MembersStoreState {
    invitations: IChatInvitation[]
    sentInvitations: IChatInvitation[]
    isLoadingInvitations: boolean
    isLoadingSentInvitations: boolean
    isInvitationsInitialized: boolean
    isSentInvitationsInitialized: boolean
}

export const useMembersStore = defineStore('membersStore', {
    state: (): MembersStoreState => ({
        invitations: [],
        sentInvitations: [],
        isLoadingInvitations: false,
        isLoadingSentInvitations: false,
        isInvitationsInitialized: false,
        isSentInvitationsInitialized: false,
    }),

    getters: {
        /**
         * Количество активных приглашений
         */
        activeInvitationsCount: (state) => {
            return state.invitations.filter((inv) => !inv.is_accepted).length
        },

        /**
         * Приглашения по статусу
         */
        invitationsByStatus: (state) => (isAccepted: boolean) => {
            return state.invitations.filter((inv) => inv.is_accepted === isAccepted)
        },

        /**
         * Непринятые приглашения
         */
        pendingInvitations: (state) => {
            return state.invitations.filter((inv) => !inv.is_accepted)
        },

        /**
         * Принятые приглашения
         */
        acceptedInvitations: (state) => {
            return state.invitations.filter((inv) => inv.is_accepted)
        },

        /**
         * Проверка прав текущего пользователя в чате
         */
        canManageMembers: () => (chatType: string, currentUserRole?: string) => {
            // Логика проверки прав (можно расширить в зависимости от ролей)
            if (chatType === 'direct' || chatType === 'dialog') {
                return false // В личных диалогах нельзя управлять участниками
            }

            // Для групп и каналов - зависит от роли
            return currentUserRole === 'admin' || currentUserRole === 'owner'
        },
    },

    actions: {
        /**
         * Получает список приглашений в чаты
         */
        async fetchInvitations(): Promise<void> {
            // Предотвращаем дублирование запросов
            if (this.isLoadingInvitations || this.isInvitationsInitialized) {
                return
            }

            this.isLoadingInvitations = true

            try {
                const result = await inviteApiService.fetchInvitations()

                if (result.success && result.data) {
                    // Дополняем каждое приглашение полем invited_user если его нет
                    const userStore = useUserStore()
                    const currentUser = userStore.user
                    const currentUserId = currentUser?.uuid || currentUser?.id?.toString()

                    this.invitations = result.data
                        .filter((invitation) => {
                            // Показываем только приглашения ДЛЯ текущего пользователя (входящие)
                            // Исключаем приглашения ОТ текущего пользователя (исходящие)
                            const createdById = invitation.created_by?.id || invitation.created_by
                            return createdById !== currentUserId
                        })
                        .map((invitation) => {
                            // Если invited_user отсутствует, добавляем данные текущего пользователя
                            if (!invitation.invited_user && currentUser) {
                                return {
                                    ...invitation,
                                    invited_user: {
                                        id: currentUser.uuid || currentUser.id?.toString() || '',
                                        first_name: currentUser.first_name || '',
                                        last_name: currentUser.last_name || '',
                                        middle_name: currentUser.middle_name || '',
                                        phone_number: currentUser.phone_number || '',
                                        birth_date: currentUser.birth_date || null,
                                    },
                                }
                            }
                            return invitation
                        })
                } else {
                    this.invitations = []
                    if (result.error) {
                        console.warn('Ошибка загрузки приглашений:', result.error)
                    }
                }

                // Отмечаем как инициализированное только при успешном выполнении
                this.isInvitationsInitialized = true
            } catch (error) {
                this.invitations = []
                console.error('Критическая ошибка загрузки приглашений:', error)
            } finally {
                this.isLoadingInvitations = false
            }
        },

        /**
         * Получает список отправленных приглашений
         */
        async fetchSentInvitations(): Promise<void> {
            // Предотвращаем дублирование запросов
            if (this.isLoadingSentInvitations || this.isSentInvitationsInitialized) {
                return
            }

            this.isLoadingSentInvitations = true

            try {
                const result = await inviteApiService.fetchSentInvitations()

                if (result.success && result.data) {
                    // Получаем данные текущего пользователя для фильтрации
                    const userStore = useUserStore()
                    const currentUser = userStore.user
                    const currentUserId = currentUser?.uuid || currentUser?.id?.toString()

                    if (currentUserId) {
                        // Фильтруем приглашения, которые создал текущий пользователь
                        this.sentInvitations = result.data.filter((invitation) => {
                            const createdById = invitation.created_by?.id || invitation.created_by
                            return createdById === currentUserId
                        })

                        console.log('[MembersStore] Filtered sent invitations:', {
                            currentUserId,
                            allInvitations: result.data,
                            sentInvitations: this.sentInvitations,
                        })
                    } else {
                        this.sentInvitations = []
                        console.warn(
                            'Не удалось определить ID текущего пользователя для фильтрации исходящих приглашений',
                        )
                    }
                } else {
                    this.sentInvitations = []
                    if (result.error) {
                        console.warn('Ошибка загрузки исходящих приглашений:', result.error)
                    }
                }

                // Отмечаем как инициализированное только при успешном выполнении
                this.isSentInvitationsInitialized = true
            } catch (error) {
                this.sentInvitations = []
                console.error('Критическая ошибка загрузки исходящих приглашений:', error)
            } finally {
                this.isLoadingSentInvitations = false
            }
        },

        /**
         * Принудительно обновляет приглашения (сбрасывает кэш)
         */
        async refreshInvitations(): Promise<void> {
            this.isInvitationsInitialized = false
            await this.fetchInvitations()
        },

        /**
         * Принудительно обновляет исходящие приглашения (сбрасывает кэш)
         */
        async refreshSentInvitations(): Promise<void> {
            this.isSentInvitationsInitialized = false
            await this.fetchSentInvitations()
        },

        /**
         * Принимает приглашение в чат
         */
        async acceptInvitation(invitationId: number): Promise<boolean> {
            try {
                const result = await inviteApiService.acceptInvitation(invitationId)

                if (result.success) {
                    // Удаляем приглашение из списка
                    this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)

                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'success',
                        title: 'Успешно',
                        message: 'Приглашение принято',
                        time: 3000,
                    })

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось принять приглашение',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось принять приглашение',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Отклоняет полученное приглашение
         */
        async declineInvitation(invitationId: number): Promise<boolean> {
            try {
                const result = await inviteApiService.declineInvitation(invitationId)

                if (result.success) {
                    // Удаляем приглашение из списка
                    this.invitations = this.invitations.filter((inv) => inv.id !== invitationId)

                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'info',
                        title: 'Отклонено',
                        message: 'Приглашение отклонено',
                        time: 3000,
                    })

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось отклонить приглашение',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отклонить приглашение',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Удаляет отправленное приглашение
         */
        async removeInvitation(invitationId: number): Promise<boolean> {
            try {
                const result = await inviteApiService.removeInvitation(invitationId)

                if (result.success) {
                    // Удаляем приглашение из списка исходящих приглашений
                    this.sentInvitations = this.sentInvitations.filter(
                        (inv) => inv.id !== invitationId,
                    )

                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'info',
                        title: 'Удалено',
                        message: 'Приглашение отозвано',
                        time: 3000,
                    })

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось отозвать приглашение',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось отозвать приглашение',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Добавляет участников в чат (отправляет приглашения)
         */
        async addMembersToChat(chatId: number, userIds: string[]): Promise<boolean> {
            try {
                const result = await chatApiService.addMembersToChat(chatId, { user_ids: userIds })

                if (result.success) {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'success',
                        title: 'Успешно',
                        message: 'Приглашения отправлены',
                        time: 3000,
                    })

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось пригласить участников',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось пригласить участников',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Удаляет участника из чата
         */
        async removeMemberFromChat(chatId: number, userId: string): Promise<boolean> {
            try {
                const result = await chatApiService.removeMemberFromChat(chatId, userId)

                if (result.success) {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'success',
                        title: 'Успешно',
                        message: 'Участник удален из чата',
                        time: 3000,
                    })

                    return true
                } else {
                    const fb = useFeedbackStore()
                    fb.showToast({
                        type: 'error',
                        title: 'Ошибка',
                        message: result.error || 'Не удалось удалить участника',
                        time: 7000,
                    })
                    return false
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось удалить участника',
                    time: 7000,
                })
                return false
            }
        },

        /**
         * Обрабатывает новое приглашение из WebSocket
         */
        handleNewInvitation(data: any): void {
            try {
                console.log('[MembersStore] Получено WebSocket событие нового приглашения:', data)

                // Извлекаем данные приглашения из WebSocket сообщения
                const invitationData = data?.invitation || data?.data || data

                if (!invitationData?.chat || !invitationData?.created_by) {
                    console.warn('[MembersStore] Некорректные данные приглашения:', invitationData)
                    return
                }

                // Получаем данные текущего пользователя
                const userStore = useUserStore()
                const currentUser = userStore.user
                const currentUserUuid = currentUser?.uuid || currentUser?.id?.toString() || null
                const createdByUuid = invitationData.created_by?.id || invitationData.created_by

                console.log('[MembersStore] Анализ приглашения:', {
                    currentUserUuid,
                    createdByUuid,
                    invitationData,
                    isFromCurrentUser: createdByUuid === currentUserUuid,
                    invitedUserId: invitationData.invited_user?.id,
                })

                const invitation: IChatInvitation = {
                    id: invitationData.id,
                    chat: invitationData.chat,
                    created_by: invitationData.created_by,
                    invited_user:
                        invitationData.invited_user ||
                        (currentUser
                            ? {
                                  id: currentUser.uuid || currentUser.id?.toString() || '',
                                  first_name: currentUser.first_name || '',
                                  last_name: currentUser.last_name || '',
                                  middle_name: currentUser.middle_name || '',
                                  phone_number: currentUser.phone_number || '',
                                  birth_date: currentUser.birth_date || null,
                              }
                            : undefined),
                    is_accepted: invitationData.is_accepted || false,
                    created_at: invitationData.created_at || new Date().toISOString(),
                }

                // Если приглашение создано текущим пользователем - добавляем в исходящие
                if (createdByUuid === currentUserUuid) {
                    console.log('[MembersStore] Добавляем в исходящие приглашения')
                    const existingIndex = this.sentInvitations.findIndex(
                        (inv) => inv.id === invitation.id,
                    )
                    if (existingIndex === -1) {
                        this.sentInvitations.unshift(invitation)
                        console.log('[MembersStore] Исходящее приглашение добавлено')
                    } else {
                        this.sentInvitations[existingIndex] = invitation
                        console.log('[MembersStore] Исходящее приглашение обновлено')
                    }
                }
                // Иначе добавляем в входящие (если приглашение для текущего пользователя)
                else {
                    const invitedUserId = invitation.invited_user?.id
                    if (invitedUserId === currentUserUuid) {
                        console.log('[MembersStore] Добавляем в входящие приглашения')
                        const existingIndex = this.invitations.findIndex(
                            (inv) =>
                                inv.chat.id === invitation.chat.id &&
                                inv.invited_user?.id === invitation.invited_user?.id,
                        )

                        if (existingIndex !== -1) {
                            this.invitations.splice(existingIndex, 1, invitation)
                            console.log('[MembersStore] Входящее приглашение обновлено')
                        } else {
                            this.invitations.unshift(invitation)
                            console.log('[MembersStore] Входящее приглашение добавлено')
                        }

                        // Показываем уведомление
                        const fb = useFeedbackStore()
                        fb.showToast({
                            type: 'info',
                            title: 'Новое приглашение',
                            message: `${invitation.created_by.first_name} ${invitation.created_by.last_name} пригласил вас в "${invitation.chat.title}"`,
                            time: 5000,
                        })
                    }
                }

                console.log('[MembersStore] Обновленные списки:', {
                    invitations: this.invitations.length,
                    sentInvitations: this.sentInvitations.length,
                })
            } catch (error) {
                console.warn('Ошибка обработки нового приглашения:', error)
            }
        },

        /**
         * Обрабатывает удаление приглашения через WebSocket
         */
        handleInvitationRemoved(data: any): void {
            try {
                console.log('[MembersStore] Получено WebSocket событие удаления приглашения:', data)

                const invitationData = data?.invitation || data?.data || data
                const invitationId = invitationData?.id || invitationData

                if (!invitationId) {
                    console.warn(
                        '[MembersStore] Не удалось получить ID приглашения:',
                        invitationData,
                    )
                    return
                }

                // Удаляем из входящих приглашений
                const incomingIndex = this.invitations.findIndex((inv) => inv.id === invitationId)
                if (incomingIndex !== -1) {
                    this.invitations.splice(incomingIndex, 1)
                    console.log('[MembersStore] Приглашение удалено из входящих')
                }

                // Удаляем из исходящих приглашений
                const outgoingIndex = this.sentInvitations.findIndex(
                    (inv) => inv.id === invitationId,
                )
                if (outgoingIndex !== -1) {
                    this.sentInvitations.splice(outgoingIndex, 1)
                    console.log('[MembersStore] Приглашение удалено из исходящих')
                }

                console.log('[MembersStore] Обновленные списки после удаления:', {
                    invitations: this.invitations.length,
                    sentInvitations: this.sentInvitations.length,
                })
            } catch (error) {
                console.warn('Ошибка обработки удаления приглашения:', error)
            }
        },

        /**
         * Обрабатывает изменения состава участников из WebSocket
         */
        handleMembershipUpdate(data: any): void {
            // Логика будет делегирована в основной чат стор для перезагрузки списка чатов
            console.log('Обновление участников:', data)
        },

        /**
         * Получает количество участников в чате
         */
        getChatMembersCount(chatMembers?: any[]): number {
            return chatMembers?.length || 0
        },

        /**
         * Сбрасывает состояние стора
         */
        reset(): void {
            this.invitations = []
            this.isLoadingInvitations = false
        },
    },
})
