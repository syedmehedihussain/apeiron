import { create } from 'zustand';
import type { ServerEvent } from '@apeiron/shared';

export type SocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export const useSocketStatus = create<{ status: SocketStatus }>(() => ({ status: 'connecting' }));

type Handler = (event: ServerEvent) => void;

/**
 * One WebSocket for the whole app (docs/api.md). Topics are reference-counted so screens can
 * subscribe while mounted. Reconnects with backoff and tells listeners so they can re-fetch.
 */
class EventSocket {
  private ws: WebSocket | null = null;
  private readonly topics = new Map<string, number>();
  private readonly handlers = new Set<Handler>();
  private readonly reconnectHandlers = new Set<() => void>();
  private attempt = 0;
  private timer: number | null = null;
  private started = false;

  start(): void {
    if (this.started) return;
    this.started = true;
    this.connect();
  }

  private connect(): void {
    const url = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      const wasReconnect = this.attempt > 0;
      this.attempt = 0;
      useSocketStatus.setState({ status: 'open' });
      this.sendTopics();
      if (wasReconnect) this.reconnectHandlers.forEach((fn) => fn());
    };
    ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(String(msg.data)) as ServerEvent;
        this.handlers.forEach((fn) => fn(event));
      } catch {
        // ignore malformed events
      }
    };
    ws.onclose = () => {
      this.ws = null;
      useSocketStatus.setState({ status: 'reconnecting' });
      const delay = Math.min(10_000, 500 * 2 ** this.attempt++);
      this.timer = window.setTimeout(() => this.connect(), delay);
    };
  }

  private sendTopics(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', topics: [...this.topics.keys()] }));
    }
  }

  subscribe(topic: string): () => void {
    this.topics.set(topic, (this.topics.get(topic) ?? 0) + 1);
    this.sendTopics();
    return () => {
      const n = (this.topics.get(topic) ?? 1) - 1;
      if (n <= 0) this.topics.delete(topic);
      else this.topics.set(topic, n);
      this.sendTopics();
    };
  }

  on(fn: Handler): () => void {
    this.handlers.add(fn);
    return () => this.handlers.delete(fn);
  }

  onReconnect(fn: () => void): () => void {
    this.reconnectHandlers.add(fn);
    return () => this.reconnectHandlers.delete(fn);
  }

  stop(): void {
    if (this.timer) window.clearTimeout(this.timer);
    this.ws?.close();
    this.started = false;
  }
}

export const socket = new EventSocket();
