<script setup lang="ts">
/**
 * Рефакторенный компонент ResponsibilityEntries
 * 
 * Принципы:
 * - KISS: разбит на мелкие компоненты
 * - DRY: использует переиспользуемые composables
 * - Единственная ответственность: координация дочерних компонентов
 */

import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'

// Stores
import { useApiStore } from '@/refactoring/modules/apiStore/stores/apiStore'
import { useResponsibilityEntries } from '@/refactoring/modules/responsibilityEntries/stores/responsibilityEntriesStore'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'
import { useTicketsStore } from '@/refactoring/modules/tickets/stores/ticketsStore'

// Components
import ResponsibilityActions from '@/components/responsibility/ResponsibilityActions.vue'
import ResponsibilityForm from '@/components/responsibility/ResponsibilityForm.vue'
import ResponsibilityHistory from '@/components/responsibility/ResponsibilityHistory.vue'

// Composables
import { useResponsibilityActions } from '@/composables/useResponsibilityActions'

// Types
import type { IEmployee } from '@/refactoring/modules/apiStore/types/employees/IEmployee'
import type { IResponsibilityEntry } from '@/refactoring/modules/responsibilityEntries/types/IResponsibilityEntry'
import type { ICreateResponsibilityEntryPayload } from '@/refactoring/modules/responsibilityEntries/types/payloads/ICreateResponsibilityEntryPayload'

const props = defineProps({
  isActive: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  canReturn: { type: Boolean, default: false },
  entityType: { type: String, default: 'adverse' }
})

const emit = defineEmits(['entry-added'])

// Stores
const apiStore = useApiStore()
const responsibilityEntriesStore = useResponsibilityEntries()
const feedbackStore = useFeedbackStore()
const ticketsStore = useTicketsStore()

const { responsibilityEntry, isCreatingEntry, fieldValidation } = storeToRefs(responsibilityEntriesStore)

// Route
const route = useRoute()
const id = Number(route.params.id)

// State
const isFormVisible = ref(!id)
const showEmployeeModal = ref(false)

// Computed
const currentEntity = computed(() => {
  return props.entityType === 'ticket'
    ? ticketsStore.currentTicket
    : apiStore.currentAdverseEvent
})

const responsibilityEntriesList = computed<IResponsibilityEntry[]>(() => {
  const entries = currentEntity.value?.responsibility_entries
  return Array.isArray(entries) ? entries as IResponsibilityEntry[] : []
})

const filteredEmployees = computed(() => {
  if (!responsibilityEntry.value.department_to?.id) return apiStore.employees
  return apiStore.employees.filter(
    emp => emp.department?.id === responsibilityEntry.value.department_to?.id
  )
})

// Composables
const { takeOnWorkEvent, completeEvent } = useResponsibilityActions(props.entityType, currentEntity)

// Methods
const getStatusText = (status: string | undefined) => {
  if (!status) return '----'
  const statusMap = apiStore.responsibilityEntriesStatuses
  return statusMap[status as keyof typeof statusMap] || status
}

const activateValidation = () => {
  isCreatingEntry.value = true
  isFormVisible.value = true
}

const validateResponsibilityEntry = (): boolean => {
  fieldValidation.value.responsibilityValidation = {
    employee_type: false,
    instructions_type: false,
    deadline_type: false,
  }

  let ok = true
  const empOk = !!responsibilityEntry.value.responsible_employee?.id
  const instrOk = !!(responsibilityEntry.value.instructions && responsibilityEntry.value.instructions.trim())
  const deadlineOk = !!responsibilityEntry.value.deadline_time

  if (!empOk) { fieldValidation.value.responsibilityValidation.employee_type = true; ok = false }
  if (!instrOk) { fieldValidation.value.responsibilityValidation.instructions_type = true; ok = false }
  if (!deadlineOk) { fieldValidation.value.responsibilityValidation.deadline_type = true; ok = false }

  if (!ok) {
    const errs: string[] = []
    const fv = fieldValidation.value.responsibilityValidation
    if (fv.employee_type) errs.push('не выбран исполнитель')
    if (fv.instructions_type) errs.push('не описана задача')
    if (fv.deadline_type) errs.push('не выбран срок выполнения')
    
    feedbackStore.showToast({
      type: 'error',
      title: 'Заполните обязательные поля',
      message: `Заполните обязательные поля: ${errs.join(', ')}`,
      time: 7000,
    })
  }
  return ok
}

const onSubmit = async (): Promise<void> => {
  if (!validateResponsibilityEntry()) return

  if (props.entityType === 'ticket') {
    try {
      const f = responsibilityEntry.value
      const payload: ICreateResponsibilityEntryPayload = {
        event_id: Number(id),
        department_from: f.department_from ? {
          id: String(f.department_from.id),
          name: f.department_from.name ?? ''
        } : null,
        supervisor: f.supervisor ? {
          id: String(f.supervisor.id),
          first_name: f.supervisor.first_name ?? '',
          last_name: f.supervisor.last_name ?? '',
          middle_name: f.supervisor.middle_name ?? '',
          gender: f.supervisor.gender ?? 'М',
          phone_number: f.supervisor.phone_number ?? null,
          birth_date: f.supervisor.birth_date ?? null
        } : null,
        department_to: f.department_to ? {
          id: String(f.department_to.id)
        } : null,
        responsible_employee: f.responsible_employee ? {
          id: String(f.responsible_employee.id),
          name: f.responsible_employee.name ?? ''
        } : null,
        instructions: f.instructions ?? '',
        completion_report: f.completion_report ?? '',
        urgency: Number(f.urgency ?? 1),
        deadline_time: f.deadline_time ? new Date(f.deadline_time).toISOString() : null,
        files: []
      }

      await responsibilityEntriesStore.createTicketResponsibilityEntry(payload)
      await ticketsStore.fetchTicket(Number(id))
    } catch (error) {
      console.error('Ошибка при создании записи ответственности для тикета:', error)
      return
    }
  } else {
    responsibilityEntriesStore.pushTempResponsibilityEntry()
  }

  isFormVisible.value = false
  responsibilityEntry.value.responsible_employee = null
  responsibilityEntry.value.instructions = ''
  responsibilityEntry.value.deadline_time = null

  emit('entry-added')
}

const onEmployeeSelected = (employee: IEmployee | null) => {
  responsibilityEntry.value.responsible_employee = employee
}
</script>

<template>
  <div class="responsibility-entries">
    <!-- Панель действий (вынесена в отдельный компонент) -->
    <ResponsibilityActions
      :id="id"
      :is-form-visible="isFormVisible"
      :disabled="disabled"
      :can-return="canReturn"
      :entity-type="entityType"
      :current-entity="currentEntity"
      @add-executor="activateValidation"
      @take-work="takeOnWorkEvent"
      @complete="completeEvent"
      @return-work="takeOnWorkEvent"
    />

    <!-- Форма создания/редактирования (вынесена в отдельный компонент) -->
    <ResponsibilityForm
      v-if="isFormVisible"
      v-model:show-employee-modal="showEmployeeModal"
      :responsibility-entry="responsibilityEntry"
      :field-validation="fieldValidation"
      :filtered-employees="filteredEmployees"
      :is-creating-entry="isCreatingEntry"
      :entity-type="entityType"
      @submit="onSubmit"
      @employee-selected="onEmployeeSelected"
    />

    <!-- История мероприятий (вынесена в отдельный компонент) -->
    <ResponsibilityHistory
      :entries="responsibilityEntriesList"
      :get-status-text="getStatusText"
    />
  </div>
</template>

<style lang="scss" scoped>
/* Стили перенесены в дочерние компоненты */
</style>
