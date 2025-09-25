<script setup lang="ts">
/**
 * Компонент формы создания записи ответственности
 * 
 * Принципы:
 * - KISS: только форма, без бизнес-логики
 * - Единственная ответственность: UI для ввода данных
 * - Все данные через props, события через emit
 */

import { computed } from 'vue'
import EmployeeSelectionModal from '@/components/adverseEvents/EmployeeSelectionModal.vue'
import { getFullName } from '@/refactoring/utils/formatters'

interface Props {
  responsibilityEntry: any
  fieldValidation: any
  filteredEmployees: any[]
  isCreatingEntry: boolean
  entityType: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'submit': []
  'employee-selected': [employee: any]
}>()

const showEmployeeModal = defineModel<boolean>('showEmployeeModal', { default: false })

const employeeToLabel = computed(() =>
  props.responsibilityEntry.responsible_employee
    ? getFullName(props.responsibilityEntry.responsible_employee)
    : ''
)

const deadlineDateModel = computed<Date | null>({
  get() {
    if (!props.responsibilityEntry.deadline_time) return null
    const dt = new Date(props.responsibilityEntry.deadline_time as string)
    return isNaN(dt.getTime()) ? null : dt
  },
  set(val) {
    props.responsibilityEntry.deadline_time = val
      ? val instanceof Date ? val.toISOString() : String(val)
      : null
  }
})

function onEmployeeSelected(employee: any) {
  emit('employee-selected', employee)
}
</script>

<template>
  <form @submit.prevent="emit('submit')" class="mb-8">
    <div class="mb-5 grid grid-cols-12 gap-4">
      <div class="col-span-12 md:col-span-6">
        <label class="block font-bold mb-3" for="employee_to">Исполнитель</label>
        <div :class="fieldValidation.responsibilityValidation.employee_type ? 'field-error' : ''">
          <Button
            :label="employeeToLabel || 'Не выбрано. Нажмите, чтобы выбрать'"
            variant="link"
            class="!pl-0"
            @click="showEmployeeModal = true"
          />
        </div>
      </div>
    </div>
    
    <div class="mb-5 grid grid-cols-12 gap-4">
      <div class="col-span-full">
        <label class="block font-bold mb-3" for="comment">Описание задачи</label>
        <Textarea
          v-model="responsibilityEntry.instructions"
          rows="3"
          cols="20"
          id="comment"
          fluid
          :class="fieldValidation.responsibilityValidation.instructions_type ? 'field-error' : ''"
        />
      </div>
    </div>
    
    <div class="col-span-12 md:col-span-6">
      <label class="block w-full font-bold mb-3" for="deadline_time">Срок выполнения</label>
      <DatePicker
        v-model="deadlineDateModel"
        showTime
        showIcon
        showButtonBar
        inputId="deadline_time"
        hourFormat="24"
        fluid
        :class="fieldValidation.responsibilityValidation.deadline_type ? 'field-error' : ''"
      />
    </div>
    
    <EmployeeSelectionModal
      v-model:visible="showEmployeeModal"
      target="responsibility_entry"
      :employees="filteredEmployees"
      :selected-employee-id="responsibilityEntry.responsible_employee?.id"
      @employee-selected="onEmployeeSelected"
    />
    
    <Button
      v-if="isCreatingEntry"
      type="submit"
      label="Создать запись ответственности"
      class="mt-4"
    />
  </form>
</template>

<style lang="scss" scoped>
.field-error {
  border: 1px solid #ff5252 !important;
  border-radius: 6px;
}
</style>