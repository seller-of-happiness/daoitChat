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
    isLoadingInvitations: boolean
}

export const useMembersStore = defineStore('membersStore', {
    state: (): MembersStoreState => ({
        invitations: [],
        isLoadingInvitations: false,
    }),

    getters: {
        /**
         * Количество активных приглашений
         */
        activeInvitationsCount: (state) => {
            return state.invitations.filter(inv => !inv.is_accepted).length
        },

        /**
         * Приглашения по статусу
         */
        invitationsByStatus: (state) => (isAccepted: boolean) => {
            return state.invitations.filter(inv => inv.is_accepted === isAccepted)
        },

        /**
         * Непринятые приглашения
         */
        pendingInvitations: (state) => {
            return state.invitations.filter(inv => !inv.is_accepted)
        },

        /**
         * Принятые приглашения
         */
        acceptedInvitations: (state) => {
            return state.invitations.filter(inv => inv.is_accepted)
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
            this.isLoadingInvitations = true

            try {
                const result = await inviteApiService.fetchInvitations()
                
                if (result.success && result.data) {
                    // Дополняем каждое приглашение полем invited_user если его нет
                    const userStore = useUserStore()
                    const currentUser = userStore.user

                    this.invitations = result.data.map(invitation => {
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
            } catch (error) {
                this.invitations = []
                console.error('Критическая ошибка загрузки приглашений:', error)
            } finally {
                this.isLoadingInvitations = false
            }
        },

        /**
         * Принимает приглашение в чат
         */
        async acceptInvitation(invitationId: number): Promise<boolean> {
            try {
                const result = await inviteApiService.acceptInvitation(invitationId)
                
                if (result.success) {
                    // Удаляем приглашение из списка
                    this.invitations = this.invitations.filter(inv => inv.id !== invitationId)

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
                    this.invitations = this.invitations.filter(inv => inv.id !== invitationId)

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
                // Извлекаем данные приглашения из WebSocket сообщения
                const invitationData = data?.data || data

                if (!invitationData?.chat || !invitationData?.created_by) {
                    return
                }

                // Получаем данные текущего пользователя если invited_user отсутствует
                const userStore = useUserStore()
                const currentUser = userStore.user
                const currentUserUuid = currentUser?.uuid || currentUser?.id?.toString() || null

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
                    created_at: new Date().toISOString(),
                }

                // Проверяем, что приглашение для текущего пользователя
                if (invitation.invited_user && invitation.invited_user.id !== currentUserUuid) {
                    return
                }

                // Добавляем приглашение в список, если его еще нет
                const existingIndex = this.invitations.findIndex(
                    inv =>
                        inv.chat.id === invitation.chat.id &&
                        inv.invited_user?.id === invitation.invited_user?.id,
                )

                if (existingIndex !== -1) {
                    // Обновляем существующее приглашение
                    this.invitations.splice(existingIndex, 1, invitation)
                } else {
                    // Добавляем новое приглашение в начало списка
                    this.invitations.unshift(invitation)
                }

                // Показываем уведомление
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'info',
                    title: 'Новое приглашение',
                    message: `${invitation.created_by.first_name} ${invitation.created_by.last_name} пригласил вас в "${invitation.chat.title}"`,
                    time: 5000,
                })
            } catch (error) {
                console.warn('Ошибка обработки нового приглашения:', error)
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