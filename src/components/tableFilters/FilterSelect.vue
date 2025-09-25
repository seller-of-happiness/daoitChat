<script setup lang="ts">
/**
 * Компонент Select с FloatLabel для выбора одного значения.
 * Рефакторен для использования BaseFilter компонента (DRY принцип)
 */

import BaseFilter from '@/components/common/BaseFilter.vue'
import Select from 'primevue/select'

interface Props {
  loading?: boolean
  placeholder?: string
  labelFor: string
  options: Array<any>
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  placeholder: 'Select an option'
})

const model = defineModel()

const selectProps = computed(() => ({
  options: props.options,
  showClear: true
}))
</script>

<template>
  <BaseFilter
    v-model="model"
    :loading="loading"
    :placeholder="placeholder"
    :label-for="labelFor"
    :component="Select"
    :component-props="selectProps"
  />
</template>

<style lang="scss" scoped>
</style>
