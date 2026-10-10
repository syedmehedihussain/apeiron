import type { Health } from '@cherry/shared';
import type { ConfigStore } from './config.ts';
import type { EventHub } from './events.ts';
import { checkHealth } from './health.ts';

export class HealthService {
  private current: Health | null = null;
  private pending: Promise<Health> | null = null;

  constructor(
    private readonly version: string,
    private readonly config: ConfigStore,
    private readonly hub: EventHub,
    private readonly check: () => Promise<Health> = () =>
      checkHealth(this.version, this.config.get().claude.bin),
  ) {}

  get(): Promise<Health> {
    return this.current ? Promise.resolve(this.current) : this.recheck();
  }

  recheck(): Promise<Health> {
    this.pending ??= this.check()
      .then((h) => {
        const changed = JSON.stringify(h) !== JSON.stringify(this.current);
        this.current = h;
        if (changed) this.hub.publish('projects', 'health.updated', h);
        return h;
      })
      .finally(() => {
        this.pending = null;
      });
    return this.pending;
  }
}
