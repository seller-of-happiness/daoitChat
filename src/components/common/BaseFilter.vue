<script setup lang="ts" generic="T">
/**
 * Универсальный базовый компонент фильтра
 * 
 * Принципы:
 * - DRY: объединяет общую логику FilterSelect, FilterMultiselect, FilterDate
 * - KISS: простая структура с минимальной кастомизацией
 * - Единая обертка FloatLabel для всех типов фильтров
 */

import type { Component } from 'vue'

interface Props {
  modelValue?: T
  loading?: boolean
  placeholder: string
  labelFor: string
  className?: string
  component: Component
  componentProps?: Record<string, any>
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  className: 'col-span-12 lg:col-span-6 xl:col-span-3'
})

const emit = defineEmits<{
  'update:modelValue': [value: T]
}>()

const model = computed({
  get: () => props.modelValue,
  set: (value: T) => emit('update:modelValue', value)
})
</script>

<template>
  <FloatLabel :class="className" variant="on">
    <component
      :is="component"
      v-model="model"
      :loading="loading"
      :disabled="loading"
      :inputId="labelFor"
      class="w-full"
      v-bind="componentProps"
    />
    <label :for="labelFor">{{ placeholder }}</label>
  </FloatLabel>
</template>

<style lang="scss" scoped>
</style>