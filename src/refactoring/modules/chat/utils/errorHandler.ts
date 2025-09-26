/**
 * Универсальный обработчик ошибок для чат-модуля
 * Принципы: KISS, DRY, YAGNI
 */

interface ErrorContext {
    module: string
    action: string
    chatId?: number
    messageId?: number
    userId?: string
}

interface ErrorHandlerOptions {
    showToast?: boolean
    logToConsole?: boolean
    logLevel?: 'error' | 'warn' | 'info'
}

const DEFAULT_OPTIONS: ErrorHandlerOptions = {
    showToast: true,
    logToConsole: true,
    logLevel: 'error',
}

class ChatErrorHandler {
    private feedbackStore: any = null

    setFeedbackStore(store: any): void {
        this.feedbackStore = store
    }

    handle(
        error: any,
        context: ErrorContext,
        userMessage?: string,
        options: ErrorHandlerOptions = {},
    ): void {
        const opts = { ...DEFAULT_OPTIONS, ...options }

        const errorMessage = this.extractErrorMessage(error)
        const fullContext = this.buildContext(context, error)

        if (opts.logToConsole) {
            this.logError(errorMessage, fullContext, opts.logLevel!)
        }

        if (opts.showToast && userMessage && this.feedbackStore) {
            this.showUserNotification(userMessage, opts.logLevel!)
        }

        // Здесь можно добавить отправку ошибок в систему мониторинга
        // this.sendToMonitoring(error, fullContext)
    }

    private extractErrorMessage(error: any): string {
        if (typeof error === 'string') return error
        if (error?.message) return error.message
        if (error?.response?.data?.message) return error.response.data.message
        if (error?.response?.statusText) return error.response.statusText
        return 'Неизвестная ошибка'
    }

    private buildContext(context: ErrorContext, error: any): Record<string, any> {
        return {
            ...context,
            timestamp: new Date().toISOString(),
            errorType: error?.constructor?.name || 'Unknown',
            status: error?.response?.status,
            url: error?.config?.url,
        }
    }

    private logError(message: string, context: Record<string, any>, level: string): void {
        const logMessage = `[${context.module}] ${context.action}: ${message}`

        switch (level) {
            case 'error':
                console.error(logMessage, context)
                break
            case 'warn':
                console.warn(logMessage, context)
                break
            case 'info':
                console.info(logMessage, context)
                break
        }
    }

    private showUserNotification(message: string, level: string): void {
        if (!this.feedbackStore) return

        const severity = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'info'

        this.feedbackStore.showToast({
            type: severity,
            title: this.getTitle(severity),
            message,
        })
    }

    private getTitle(severity: string): string {
        const titles = {
            error: 'Ошибка',
            warn: 'Предупреждение',
            info: 'Информация',
        }
        return titles[severity as keyof typeof titles] || 'Уведомление'
    }
}

// Создаем глобальный экземпляр
export const chatErrorHandler = new ChatErrorHandler()

// Удобные функции для использования в сторах и композиблах
export const handleChatError = (
    error: any,
    module: string,
    action: string,
    userMessage?: string,
    options?: ErrorHandlerOptions,
) => {
    chatErrorHandler.handle(error, { module, action }, userMessage, options)
}

export const handleMessageError = (
    error: any,
    action: string,
    messageId?: number,
    userMessage?: string,
) => {
    chatErrorHandler.handle(error, { module: 'Messages', action, messageId }, userMessage)
}

export const handleConnectionError = (error: any, action: string, userMessage?: string) => {
    chatErrorHandler.handle(error, { module: 'Realtime', action }, userMessage, {
        logLevel: 'warn',
    })
}

export const handleUserError = (
    error: any,
    action: string,
    userId?: string,
    userMessage?: string,
) => {
    chatErrorHandler.handle(error, { module: 'User', action, userId }, userMessage)
}

// Типы для удобства использования
export type { ErrorContext, ErrorHandlerOptions }
