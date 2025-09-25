<script setup lang="ts">
/**
 * Компонент таблицы истории записей ответственности
 * 
 * Принципы:
 * - KISS: только отображение таблицы
 * - Единственная ответственность: UI истории
 * - Переиспользуемый компонент
 */

import { ref } from 'vue'
import { formatResponsibilityDate, formatShortName } from '@/refactoring/utils/formatters'
import type { IResponsibilityEntry } from '@/refactoring/modules/responsibilityEntries/types/IResponsibilityEntry'
import type { IResponsibilityEmployee } from '@/refactoring/modules/responsibilityEntries/types/IResponsibilityEmployee'

interface Props {
  entries: IResponsibilityEntry[]
  getStatusText: (status: string | undefined) => string
}

defineProps<Props>()

const expandedDescriptionIds = ref<number[]>([])
</script>

<template>
  <div class="col-span-full">
    <p class="font-bold mb-2">История мероприятий</p>

    <div class="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
      <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead class="bg-gray-50 dark:bg-gray-800/60">
          <tr class="text-left text-sm font-semibold text-gray-700 dark:text-gray-200">
            <th class="px-4 py-3">От</th>
            <th class="px-4 py-3">Кому</th>
            <th class="px-4 py-3">Описание</th>
            <th class="px-4 py-3">Дата создания</th>
            <th class="px-4 py-3">Статус</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-gray-200 dark:divide-gray-700 text-sm">
          <!-- Пусто -->
          <tr v-if="!entries.length">
            <td colspan="5" class="px-4 py-6 text-center italic text-gray-500 dark:text-gray-400">
              По этому событию пока нет мероприятий
            </td>
          </tr>

          <!-- Строки -->
          <tr
            v-for="data in entries"
            :key="data.id"
            class="odd:bg-white even:bg-gray-50/50 dark:odd:bg-gray-900 dark:even:bg-gray-900/60 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <!-- От -->
            <td class="px-4 py-3 align-top">
              <template v-if="data.supervisor">
                {{ formatShortName(data.supervisor) }}
              </template>
            </td>

            <!-- Кому -->
            <td class="px-4 py-3 align-top">
              <template v-if="data.responsible_employee">
                {{ formatShortName(data.responsible_employee as IResponsibilityEmployee) }}
              </template>
            </td>

            <!-- Описание -->
            <td class="px-4 py-3 align-top">
              <p
                v-if="!expandedDescriptionIds.includes(Number(data.id)) && (data.instructions ?? '').length >= 100"
                class="overflow-auto"
              >
                {{ (data.instructions ?? '----').slice(0, 100) }}
                <span
                  class="text-blue-600 dark:text-sky-400 cursor-pointer"
                  @click="() => expandedDescriptionIds.push(Number(data.id))"
                />
              </p>
              <p v-else class="overflow-auto">
                {{ data.instructions }}
              </p>
            </td>

            <!-- Дата создания -->
            <td class="px-4 py-3 align-top whitespace-nowrap">
              {{ formatResponsibilityDate(data.created_at) || '—' }}
            </td>

            <!-- Статус -->
            <td class="px-4 py-3 align-top">
              {{ getStatusText(data.status) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style lang="scss" scoped>
</style>