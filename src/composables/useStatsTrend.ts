/**
 * Composable для работы с трендами статистики
 * 
 * Принципы:
 * - DRY: выносит общую логику из StatsWidget
 * - KISS: простые, понятные функции
 * - Переиспользуемость в других компонентах
 */

import { computed } from 'vue'

export interface TrendData {
  current: number
  previous: number
}

export function useStatsTrend(data: TrendData) {
  /**
   * Вычисляет разницу между текущим и предыдущим периодом
   */
  const trend = computed(() => data.current - data.previous)

  /**
   * Вычисляет процентное изменение
   */
  const percentChange = computed(() => {
    if (!data.previous) return null
    return Math.round((trend.value / data.previous) * 100)
  })

  /**
   * Формирует текстовую метку тренда
   */
  const trendLabel = computed(() => {
    if (!data.previous) return trend.value === 0 ? 'Без изменений' : `${trend.value}`
    if (trend.value > 0) return `+${trend.value}`
    if (trend.value < 0) return `${trend.value}`
    return 'Без изменений'
  })

  /**
   * Формирует текстовую метку процентного изменения
   */
  const percentLabel = computed(() => {
    if (percentChange.value === null || trend.value === 0) return ''
    if (trend.value > 0) return `на ${percentChange.value}% больше`
    if (trend.value < 0) return `на ${Math.abs(percentChange.value)}% меньше`
    return ''
  })

  /**
   * Определяет CSS класс для стилизации процентного изменения
   */
  const percentClass = computed(() => {
    if (!data.previous || trend.value === 0 || percentChange.value === null) {
      return 'text-muted-color'
    }
    if (trend.value > 0) return 'text-red-500'
    if (trend.value < 0) return 'text-green-500'
    return 'text-muted-color'
  })

  return {
    trend,
    percentChange,
    trendLabel,
    percentLabel,
    percentClass
  }
}