import type { ProjectCard } from '@cherry/shared';
import type { ConfigStore } from '../config.ts';
import type { Db } from '../db.ts';
import type { EventHub } from '../events.ts';
import { writeProjectsMd } from '../magnet/files.ts';
import { scanProjects } from './scanner.ts';

/**
 * Owns the list of project cards: serves them from the SQLite cache, rescans in the background,
 * and publishes `projects.updated` when anything changed.
 */
export class ProjectService {
  private cards: ProjectCard[] | null = null;
  private scanning: Promise<ProjectCard[]> | null = null;
  private rescanQueued = false;

  constructor(
    private readonly config: ConfigStore,
    private readonly db: Db,
    private readonly hub: EventHub,
    private readonly home: string,
  ) {
    const rows = db.prepare('SELECT card_json FROM projects ORDER BY last_worked DESC').all() as {
      card_json: string;
    }[];
    if (rows.length) this.cards = rows.map((r) => JSON.parse(r.card_json) as ProjectCard);
  }

  /** Cached cards right away if we have them; otherwise waits for the first scan. */
  async list(): Promise<ProjectCard[]> {
    if (this.cards) {
      void this.rescan();
      return this.cards;
    }
    return this.rescan();
  }

  /** The cards from the last scan, without starting a new one (waits for the first scan). */
  async known(): Promise<ProjectCard[]> {
    return this.cards ?? this.rescan();
  }

  get(id: string): ProjectCard | undefined {
    return this.cards?.find((c) => c.id === id);
  }

  rescan(): Promise<ProjectCard[]> {
    if (this.scanning) {
      this.rescanQueued = true;
      return this.scanning;
    }
    this.scanning = this.doScan().finally(() => {
      this.scanning = null;
      if (this.rescanQueued) {
        this.rescanQueued = false;
        void this.rescan();
      }
    });
    return this.scanning;
  }

  private async doScan(): Promise<ProjectCard[]> {
    const cfg = this.config.get();
    const cards = await scanProjects(this.config.projectsDir(), cfg.scan.ignore);
    const changed = JSON.stringify(cards) !== JSON.stringify(this.cards);
    this.cards = cards;
    if (changed) {
      this.save(cards);
      writeProjectsMd(this.home, cards);
      this.hub.publish('projects', 'projects.updated', { cards });
    }
    return cards;
  }

  private save(cards: ProjectCard[]): void {
    const now = Date.now();
    const insert = this.db.prepare(
      'INSERT INTO projects (id, path, card_json, last_worked, scanned_at) VALUES (?, ?, ?, ?, ?)',
    );
    this.db.transaction(() => {
      this.db.prepare('DELETE FROM projects').run();
      for (const c of cards) insert.run(c.id, c.path, JSON.stringify(c), c.lastWorked, now);
    })();
  }
}
