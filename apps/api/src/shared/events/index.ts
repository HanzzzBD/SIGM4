// Permukaan publik shared/events (SDD-SYS-06): EventBus dan outbox.
//
// Modul menerbitkan lewat `publish`; hanya entrypoint worker yang menyentuh
// `OutboxDispatcher`.
export type { DomainEvent } from './event-bus.js';
export { EventPublishError, publish, publishAll } from './event-bus.js';
export type {
  DispatcherOptions,
  EventHandler,
  OutboxEvent,
  TickResult,
} from './dispatcher.js';
export {
  BACKOFF_BASE_MS,
  EventHandlerRegistry,
  MAX_ATTEMPTS,
  OutboxDispatcher,
} from './dispatcher.js';
