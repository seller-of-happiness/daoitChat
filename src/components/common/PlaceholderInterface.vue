<script setup lang="ts">
/**
 * Универсальный компонент-заглушка для страниц в разработке
 * 
 * Принципы:
 * - KISS: простая структура, один параметр
 * - DRY: заменяет дублированные компоненты
 * - YAGNI: минимальная функциональность
 */

interface Props {
  title: string
}

defineProps<Props>()
</script>

<template>
  <div class="grid grid-cols-12 gap-8">
    <div class="col-span-12 flex justify-center items-center border-b border-surface-200 dark:border-surface-700">
      <h3 class="text-lg font-semibold text-surface-900 dark:text-surface-0">
        {{ title }}
      </h3>
    </div>
    <div class="col-span-12 h-[60px] flex justify-center items-center border-surface-200 dark:border-surface-700 subtitle">
      Компонент находится в разработке
    </div>
  </div>
</template>

<style lang="scss" scoped>
</style>