/**
 * Composable для бизнес-логики действий с ответственностью
 * 
 * Принципы:
 * - KISS: логика отдельно от UI
 * - DRY: переиспользуемая логика
 * - Единственная ответственность: управление действиями
 */

import { useRoute } from 'vue-router'
import { useApiStore } from '@/refactoring/modules/apiStore/stores/apiStore'
import { useTicketsStore } from '@/refactoring/modules/tickets/stores/ticketsStore'
import { useGlobalConfirm } from '@/refactoring/modules/feedback/utils/useGlobalConfirm'
import type { IResponsibilityEntry } from '@/refactoring/modules/responsibilityEntries/types/IResponsibilityEntry'

export function useResponsibilityActions(entityType: string, currentEntity: any) {
  const route = useRoute()
  const apiStore = useApiStore()
  const ticketsStore = useTicketsStore()
  const confirmAction = useGlobalConfirm()

  const id = Number(route.params.id)

  /**
   * Действие: «Взять в работу»
   */
  const takeOnWorkEvent = async () => {
    if (entityType === 'ticket') {
      await ticketsStore.coordinatorStart(id)
      await ticketsStore.fetchTicket(id)
    } else {
      await apiStore.takeAdverseEvent({ id })
      await apiStore.loadAdverseEvents()
    }
  }

  /**
   * Действие: «Завершить»
   */
  const completeEvent = async () => {
    // Проверяем есть ли незавершенные задачи
    const responsibilityEntries = entityType === 'ticket'
      ? ticketsStore.currentTicket?.responsibility_entries as IResponsibilityEntry[]
      : apiStore.currentAdverseEvent.responsibility_entries as IResponsibilityEntry[]

    const hasUncompletedTasks = responsibilityEntries?.some(
      (entry: IResponsibilityEntry) => entry.status !== 'completed'
    )

    if (hasUncompletedTasks) {
      try {
        await confirmAction({
          message: 'Не все исполнители отчитались о завершении задач! Завершить?',
          header: 'Подтверждение действия',
          icon: 'pi pi-exclamation-triangle',
          acceptLabel: 'Завершить',
          rejectLabel: 'Отмена',
          acceptClass: 'p-button-danger',
        })
      } catch {
        // Отмена — ничего не делаем
        return
      }
    }

    if (entityType === 'ticket') {
      await ticketsStore.coordinatorComplete(id)
      await ticketsStore.fetchTicket(id)
    } else {
      await apiStore.completeAdverseEvent({ id })
      await apiStore.loadAdverseEvents()
    }
  }

  return {
    takeOnWorkEvent,
    completeEvent
  }
}