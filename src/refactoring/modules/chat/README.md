# Рефакторинг чат модуля

## Обзор

Проведена полная декомпозиция монолитного `chatStore.ts` на специализированные модули, используя принципы SOLID и паттерны проектирования. Исходный файл в 1570 строк был разбит на логически связанные компоненты.

## Архитектура

### 🏗️ Структура проекта

```
src/refactoring/modules/chat/
├── stores/                     # Pinia сторы
│   ├── chatStore.ts           # Координирующий стор (основной)
│   ├── messagesStore.ts       # Управление сообщениями и реакциями
│   ├── membersStore.ts        # Участники и приглашения
│   ├── searchStore.ts         # Поиск с дебаунсингом и кешированием
│   └── realtimeStore.ts       # WebSocket соединение
├── services/                   # API сервисы и бизнес-логика
│   ├── chatApi.ts             # HTTP операции с чатами
│   ├── messageApi.ts          # HTTP операции с сообщениями
│   ├── inviteApi.ts           # HTTP операции с приглашениями
│   ├── reactionApi.ts         # HTTP операции с реакциями
│   ├── chatWebSocketService.ts # Обработка WebSocket событий
│   └── ChatFacade.ts          # Фасад для сложных операций
├── composables/               # Vue композиблы
│   └── useChatModule.ts       # Главный композибл-координатор
└── types/                     # TypeScript типы
    └── api.ts                 # Типы для API ответов
```

## 📋 Компоненты системы

### Сторы (Pinia)

#### 1. `chatStore.ts` - Координирующий стор
**Ответственности:**
- Управление списком чатов и текущим чатом
- Координация между специализированными сторами  
- Инициализация и lifecycle управление
- Базовые CRUD операции
- Счетчики непрочитанных сообщений

**Ключевые особенности:**
- ✅ Lightweight координатор (убрана логика сообщений, реакций, поиска)
- ✅ Использует API сервисы вместо прямых HTTP вызовов
- ✅ Делегирует специфичную логику в соответствующие сторы
- ✅ Сохраняет совместимость с существующими интерфейсами

#### 2. `messagesStore.ts` - Управление сообщениями
**Ответственности:**
- Состояние сообщений текущего чата
- Отправка и редактирование сообщений
- Управление реакциями на сообщения
- Оптимистичные обновления
- Сортировка и группировка сообщений

**Ключевые методы:**
- `fetchMessages()` - загрузка сообщений
- `sendMessage()` / `sendMessageWithFiles()` - отправка
- `addReaction()` / `removeReaction()` - управление реакциями
- `handleNewMessage()` - обработка WebSocket событий

#### 3. `membersStore.ts` - Участники и приглашения
**Ответственности:**
- Управление приглашениями в чаты
- Принятие/отклонение приглашений
- Добавление/удаление участников
- Проверка прав доступа

**Ключевые методы:**
- `fetchInvitations()` - загрузка приглашений
- `acceptInvitation()` / `declineInvitation()` - управление приглашениями
- `addMembersToChat()` / `removeMemberFromChat()` - управление участниками

#### 4. `searchStore.ts` - Поиск
**Ответственности:**
- Поиск чатов и сотрудников
- Дебаунсинг поисковых запросов (300ms)
- Кеширование результатов поиска
- Управление состоянием поиска

**Ключевые особенности:**
- ✅ Автоматический дебаунсинг запросов
- ✅ Кеширование для повышения производительности
- ✅ Поддержка как дебаунсинг, так и немедленного поиска

#### 5. `realtimeStore.ts` - WebSocket соединение
**Ответственности:**
- Управление WebSocket подключением к центрифуго
- Переподключение при обрывах связи
- Диспетчинг событий к соответствующим сторам
- Мониторинг состояния соединения

**Ключевые особенности:**
- ✅ Автоматическое переподключение с экспоненциальной задержкой
- ✅ Паттерн Observer для уведомления сторов
- ✅ Мониторинг здоровья соединения

### API Сервисы

#### 1. `chatApi.ts` - HTTP операции с чатами
- `fetchChats()` - получение списка чатов
- `createDialog()` / `createGroup()` / `createChannel()` - создание чатов
- `updateChat()` / `deleteChat()` - редактирование
- `addMembersToChat()` / `removeMemberFromChat()` - управление участниками
- `searchChats()` - поиск
- `fetchUnreadCounts()` - счетчики непрочитанных

#### 2. `messageApi.ts` - HTTP операции с сообщениями
- `fetchMessages()` - загрузка сообщений
- `sendMessage()` / `sendMessageWithFiles()` - отправка
- `updateMessage()` / `deleteMessage()` - редактирование
- `uploadAttachment()` - загрузка вложений

#### 3. `inviteApi.ts` - HTTP операции с приглашениями
- `fetchInvitations()` - получение приглашений
- `acceptInvitation()` / `declineInvitation()` - управление
- `removeInvitation()` - отзыв приглашений

#### 4. `reactionApi.ts` - HTTP операции с реакциями
- `fetchReactionTypes()` - типы реакций
- `addReaction()` / `removeReaction()` - управление реакциями
- `setExclusiveReaction()` - эксклюзивная реакция (замена)

#### 5. `chatWebSocketService.ts` - WebSocket обработка
- Паттерн Observer для уведомления подписчиков
- Типизированная обработка событий
- Fallback обработка для совместимости

### Координаторы

#### 1. `useChatModule.ts` - Главный композибл
**Предназначение:** Единая точка входа для Vue компонентов

**Преимущества:**
- ✅ Простой и понятный API для компонентов
- ✅ Проксирование методов из всех сторов
- ✅ Реактивные computed свойства
- ✅ Скрытие сложности координации

**Пример использования:**
```typescript
const {
  chats, messages, currentChat,
  isLoadingChats, isLoadingMessages,
  sendMessage, openChat, searchChats
} = useChatModule()
```

#### 2. `ChatFacade.ts` - Фасад для сложных операций
**Предназначение:** Высокоуровневые операции, требующие координации между сторами

**Ключевые методы:**
- `initializeChat()` - полная инициализация чата
- `createAndOpenChat()` - создание и немедленное открытие
- `acceptInvitationAndOpenChat()` - принятие приглашения и открытие
- `sendMessageAndUpdateChat()` - отправка с обновлением состояния
- `manageChatMembers()` - управление участниками
- `resetChatModule()` / `restoreChatModuleState()` - lifecycle

## 🚀 Преимущества рефакторинга

### Архитектурные улучшения
1. **Разделение ответственностей** - каждый модуль отвечает за свою область
2. **Модульность** - легко тестировать и развивать отдельные компоненты
3. **Переиспользование** - API сервисы могут использоваться в других модулях
4. **Типизация** - полная типизация всех API ответов и состояний

### Производительность
1. **Кеширование поиска** - избегаем повторных запросов
2. **Дебаунсинг** - уменьшаем нагрузку на сервер
3. **Оптимистичные обновления** - мгновенный отклик UI
4. **Ленивая загрузка** - сторы загружаются по требованию

### Поддерживаемость
1. **Четкая структура** - легко найти нужный код
2. **Единообразие** - все API сервисы используют один паттерн
3. **Обработка ошибок** - централизованная обработка в каждом сервисе
4. **Логирование** - подробные логи для отладки

### Тестируемость
1. **Изоляция** - каждый модуль можно тестировать отдельно
2. **Мокирование** - легко мокировать API сервисы
3. **Dependency Injection** - axios инстанс можно заменить для тестов

## 📖 Руководство по использованию

### Для разработчиков компонентов
Используйте главный композибл `useChatModule()`:

```typescript
<script setup lang="ts">
import { useChatModule } from '@/refactoring/modules/chat/composables/useChatModule'

const {
  chats,
  currentChat,
  messages,
  sendMessage,
  openChat
} = useChatModule()

// Отправить сообщение
const handleSendMessage = async (content: string) => {
  if (currentChat.value) {
    await sendMessage(currentChat.value.id, content)
  }
}
</script>
```

### Для сложных операций
Используйте ChatFacade:

```typescript
import { chatFacade } from '@/refactoring/modules/chat/services/ChatFacade'

// Создать и открыть группу
const group = await chatFacade.createAndOpenChat('group', {
  title: 'Новая группа',
  description: 'Описание группы'
})

// Принять приглашение и открыть чат
const chat = await chatFacade.acceptInvitationAndOpenChat(invitationId)
```

### Для прямого доступа к API
Используйте API сервисы напрямую:

```typescript
import { chatApiService } from '@/refactoring/modules/chat/services/chatApi'

const result = await chatApiService.fetchChats()
if (result.success) {
  console.log(result.data)
} else {
  console.error(result.error)
}
```

## 🔄 Миграция с старого кода

### Совместимость
Новая система полностью совместима с существующими интерфейсами. Основные методы `chatStore` сохранены:

- `fetchChats()` ✅
- `createDialog()` ✅  
- `openChat()` ✅
- `sendMessage()` ✅ (теперь через messagesStore)
- `addReaction()` ✅ (теперь через messagesStore)

### Постепенная миграция
1. **Этап 1:** Замените импорты на новые сторы там, где это возможно
2. **Этап 2:** Используйте `useChatModule()` в новых компонентах
3. **Этап 3:** Рефакторите существующие компоненты постепенно

## 🔍 Мониторинг и отладка

### Проверка состояния системы
```typescript
import { chatFacade } from '@/refactoring/modules/chat/services/ChatFacade'

const health = chatFacade.checkSystemHealth()
console.log({
  isInitialized: health.isInitialized,
  isConnected: health.isConnected,
  hasChats: health.hasChats,
  hasMessages: health.hasMessages
})
```

### Состояние соединения
```typescript
import { useRealtimeStore } from '@/refactoring/modules/chat/stores/realtimeStore'

const realtimeStore = useRealtimeStore()
console.log(realtimeStore.connectionStatusText)
```

## 🧪 Тестирование

Каждый модуль может тестироваться независимо:

```typescript
// Тестирование API сервиса
import { chatApiService } from '@/refactoring/modules/chat/services/chatApi'

// Мокируем axios
const mockAxios = {
  get: vi.fn(),
  post: vi.fn()
}

const service = new ChatApiService(mockAxios)
```

## 📝 Заключение

Рефакторинг значительно улучшил:
- **Архитектуру** - от монолита к модульной системе
- **Производительность** - кеширование, дебаунсинг, оптимизации
- **Поддерживаемость** - четкая структура, типизация, обработка ошибок
- **Тестируемость** - изолированные модули, dependency injection
- **Расширяемость** - легко добавлять новые функции

Система готова к использованию и дальнейшему развитию! 🎉