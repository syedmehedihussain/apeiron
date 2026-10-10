import type { EventMap, EventType, ServerEvent } from '@cherry/shared';

export interface Subscriber {
  topics: Set<string>;
  send(event: ServerEvent): void;
}

/** Fan-out of server events to WebSocket clients by topic (docs/api.md). */
export class EventHub {
  private readonly subscribers = new Set<Subscriber>();
  private readonly listeners = new Set<(topic: string, event: ServerEvent) => void>();

  add(sub: Subscriber): () => void {
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  /** In-process listener for every event (used by tests and by Magnet's project summary). */
  listen(fn: (topic: string, event: ServerEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  publish<K extends EventType>(topics: string | string[], type: K, payload: EventMap[K]): void {
    const event = { type, at: Date.now(), ...payload } as ServerEvent;
    const list = Array.isArray(topics) ? topics : [topics];
    for (const sub of this.subscribers) {
      if (list.some((t) => sub.topics.has(t))) sub.send(event);
    }
    for (const fn of this.listeners) for (const t of list) fn(t, event);
  }

  get size(): number {
    return this.subscribers.size;
  }
}
