<script setup lang="ts">
/**
 * Компонент MultiSelect с фильтрацией для выбора нескольких значений.
 * Рефакторен для использования BaseFilter компонента (DRY принцип)
 */

import BaseFilter from '@/components/common/BaseFilter.vue'
import MultiSelect from 'primevue/multiselect'
import type { MultiSelectFilterEvent } from 'primevue/multiselect'
import type { IFilterProps } from '@/refactoring/types/IFilterProps'

interface Props extends IFilterProps {
  display?: string
  optionLabel?: string
  optionValue?: string
  changeHandler?: (event: any) => void
}

const props = defineProps<Props>()

// Двустороннее связывание выбранных значений
const model = defineModel<number[]>()

/**
 * Обработчик события фильтрации
 */
function onFilter(e: MultiSelectFilterEvent) {
  // Логирование события фильтрации (при необходимости)
}

const multiselectProps = computed(() => ({
  options: props.options,
  display: props.display,
  optionLabel: props.optionLabel,
  optionValue: props.optionValue,
  showClear: true,
  filter: true,
  maxSelectedLabels: 3,
  style: 'min-height: 33px',
  onFilter,
  onChange: props.changeHandler
}))
</script>

<template>
  <BaseFilter
    v-model="model"
    :loading="loading"
    :placeholder="placeholder"
    :label-for="labelFor"
    :class-name="className"
    :component="MultiSelect"
    :component-props="multiselectProps"
  />
</template>

<style lang="scss" scoped>
</style>
