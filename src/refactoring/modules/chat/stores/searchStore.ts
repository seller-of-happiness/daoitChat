/*
 * Стор для управления поиском чатов
 * 
 * Отвечает за:
 * - Поиск чатов и сотрудников
 * - Дебаунсинг поисковых запросов
 * - Кеширование результатов поиска
 * - Управление состоянием поиска
 */

import { defineStore } from 'pinia'
import type { ISearchResults } from '@/refactoring/modules/chat/types/IChat'
import { chatApiService } from '@/refactoring/modules/chat/services/chatApi'
import { useFeedbackStore } from '@/refactoring/modules/feedback/stores/feedbackStore'

interface SearchCache {
    [query: string]: ISearchResults
}

interface SearchStoreState {
    searchResults: ISearchResults | null
    isSearching: boolean
    currentQuery: string
    cache: SearchCache
    lastSearchTime: number
}

// Дебаунс для поиска (миллисекунды)
const SEARCH_DEBOUNCE_DELAY = 300

export const useSearchStore = defineStore('searchStore', {
    state: (): SearchStoreState => ({
        searchResults: null,
        isSearching: false,
        currentQuery: '',
        cache: {},
        lastSearchTime: 0,
    }),

    getters: {
        /**
         * Есть ли результаты поиска
         */
        hasResults: (state) => {
            return state.searchResults && 
                   (state.searchResults.chats.length > 0 || state.searchResults.new_dialogs.length > 0)
        },

        /**
         * Количество найденных чатов
         */
        chatsCount: (state) => state.searchResults?.chats.length || 0,

        /**
         * Количество новых диалогов
         */
        newDialogsCount: (state) => state.searchResults?.new_dialogs.length || 0,

        /**
         * Общее количество результатов
         */
        totalResultsCount: (state) => {
            if (!state.searchResults) return 0
            return state.searchResults.chats.length + state.searchResults.new_dialogs.length
        },

        /**
         * Проверка активности поиска
         */
        isActiveSearch: (state) => state.currentQuery.trim().length > 0,

        /**
         * Результаты из кеша
         */
        getCachedResults: (state) => (query: string) => {
            return state.cache[query.toLowerCase().trim()] || null
        },
    },

    actions: {
        /**
         * Выполняет поиск чатов с дебаунсингом
         */
        async searchChats(query: string, includePublic: boolean = true): Promise<void> {
            const trimmedQuery = query.trim()
            
            // Если запрос пустой - очищаем результаты
            if (!trimmedQuery) {
                this.clearSearch()
                return
            }

            this.currentQuery = trimmedQuery

            // Проверяем кеш
            const cacheKey = `${trimmedQuery.toLowerCase()}_${includePublic}`
            const cachedResult = this.cache[cacheKey]
            if (cachedResult) {
                this.searchResults = cachedResult
                return
            }

            // Дебаунсинг
            const searchTime = Date.now()
            this.lastSearchTime = searchTime

            await new Promise(resolve => setTimeout(resolve, SEARCH_DEBOUNCE_DELAY))

            // Проверяем, что это все еще актуальный поиск
            if (this.lastSearchTime !== searchTime || this.currentQuery !== trimmedQuery) {
                return
            }

            this.isSearching = true

            try {
                const result = await chatApiService.searchChats({
                    q: trimmedQuery,
                    include_public: includePublic,
                })

                // Проверяем, что поиск все еще актуален
                if (this.currentQuery !== trimmedQuery) {
                    return
                }

                if (result.success && result.data) {
                    this.searchResults = result.data
                    
                    // Кешируем результат
                    this.cache[cacheKey] = result.data
                } else {
                    this.searchResults = { chats: [], new_dialogs: [] }
                    
                    if (result.error) {
                        const fb = useFeedbackStore()
                        fb.showToast({
                            type: 'error',
                            title: 'Ошибка поиска',
                            message: result.error,
                            time: 5000,
                        })
                    }
                }
            } catch (error) {
                // Проверяем, что поиск все еще актуален
                if (this.currentQuery !== trimmedQuery) {
                    return
                }

                this.searchResults = { chats: [], new_dialogs: [] }
                
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось выполнить поиск',
                    time: 7000,
                })
            } finally {
                this.isSearching = false
            }
        },

        /**
         * Выполняет поиск с немедленным результатом (без дебаунса)
         */
        async searchImmediate(query: string, includePublic: boolean = true): Promise<ISearchResults | null> {
            const trimmedQuery = query.trim()
            
            if (!trimmedQuery) {
                return { chats: [], new_dialogs: [] }
            }

            // Проверяем кеш
            const cacheKey = `${trimmedQuery.toLowerCase()}_${includePublic}`
            const cachedResult = this.cache[cacheKey]
            if (cachedResult) {
                return cachedResult
            }

            this.isSearching = true

            try {
                const result = await chatApiService.searchChats({
                    q: trimmedQuery,
                    include_public: includePublic,
                })

                if (result.success && result.data) {
                    // Кешируем результат
                    this.cache[cacheKey] = result.data
                    return result.data
                } else {
                    if (result.error) {
                        const fb = useFeedbackStore()
                        fb.showToast({
                            type: 'error',
                            title: 'Ошибка поиска',
                            message: result.error,
                            time: 5000,
                        })
                    }
                    return { chats: [], new_dialogs: [] }
                }
            } catch (error) {
                const fb = useFeedbackStore()
                fb.showToast({
                    type: 'error',
                    title: 'Ошибка',
                    message: 'Не удалось выполнить поиск',
                    time: 7000,
                })
                return { chats: [], new_dialogs: [] }
            } finally {
                this.isSearching = false
            }
        },

        /**
         * Очищает результаты поиска
         */
        clearSearch(): void {
            this.searchResults = null
            this.currentQuery = ''
            this.isSearching = false
        },

        /**
         * Устанавливает результаты поиска напрямую
         */
        setSearchResults(results: ISearchResults | null): void {
            this.searchResults = results
        },

        /**
         * Очищает кеш поиска
         */
        clearCache(): void {
            this.cache = {}
        },

        /**
         * Удаляет конкретный результат из кеша
         */
        removeCacheEntry(query: string, includePublic: boolean = true): void {
            const cacheKey = `${query.toLowerCase().trim()}_${includePublic}`
            delete this.cache[cacheKey]
        },

        /**
         * Обновляет текущий запрос без выполнения поиска
         */
        setCurrentQuery(query: string): void {
            this.currentQuery = query.trim()
        },

        /**
         * Проверяет, есть ли результаты для конкретного запроса
         */
        hasResultsForQuery(query: string): boolean {
            const trimmedQuery = query.trim()
            if (!trimmedQuery) return false
            
            const cacheKey = `${trimmedQuery.toLowerCase()}_true`
            const cachedResult = this.cache[cacheKey]
            
            return cachedResult ? 
                (cachedResult.chats.length > 0 || cachedResult.new_dialogs.length > 0) : 
                false
        },

        /**
         * Получает все чаты из результатов поиска
         */
        getAllSearchedChats(): any[] {
            if (!this.searchResults) return []
            
            return [
                ...this.searchResults.chats,
                ...this.searchResults.new_dialogs,
            ]
        },

        /**
         * Фильтрует результаты поиска по типу
         */
        getResultsByType(type: 'chats' | 'new_dialogs'): any[] {
            if (!this.searchResults) return []
            return this.searchResults[type] || []
        },

        /**
         * Сбрасывает состояние стора
         */
        reset(): void {
            this.searchResults = null
            this.isSearching = false
            this.currentQuery = ''
            this.cache = {}
            this.lastSearchTime = 0
        },
    },
})