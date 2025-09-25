<script setup lang="ts">
/**
 * Компонент панели действий для управления ответственностью
 * 
 * Принципы:
 * - KISS: простая панель с кнопками действий
 * - Единственная ответственность: отображение кнопок управления
 * - Легко тестируется и переиспользуется
 */

interface Props {
  id?: number
  isFormVisible: boolean
  disabled: boolean
  canReturn: boolean
  entityType: string
  currentEntity?: any
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'add-executor': []
  'take-work': []
  'complete': []
  'return-work': []
}>()
</script>

<template>
  <div
    v-if="id"
    class="responsibility-entries__actions flex justify-end flex-wrap gap-4 items-end ml-auto mb-5"
  >
    <Button
      v-if="!isFormVisible && !disabled && currentEntity?.can_edit_by_coordinator && currentEntity?.can_complete"
      label="Добавить исполнителя"
      icon="pi pi-plus"
      iconPos="top"
      class="responsibility-entries__action"
      @click="emit('add-executor')"
    />

    <Button
      v-if="!isFormVisible && !disabled && currentEntity?.can_edit_by_coordinator && currentEntity?.can_take_in_progress && currentEntity?.status !== 'completed'"
      label="Взять в работу"
      icon="pi pi-bolt"
      severity="info"
      iconPos="top"
      @click="emit('take-work')"
    />

    <Button
      v-if="!isFormVisible && !disabled && currentEntity?.can_edit_by_coordinator && currentEntity?.can_complete"
      label="Завершить"
      icon="pi pi-check"
      iconPos="top"
      severity="success"
      @click="emit('complete')"
    />

    <Button
      v-if="canReturn"
      label="Вернуть в работу"
      icon="pi pi-angle-double-left"
      iconPos="top"
      severity="help"
      @click="emit('return-work')"
    />
  </div>
</template>

<style lang="scss" scoped>
</style>