import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ChatItemSchema, type ChatItem } from '@cherry/shared';

/** JSONL transcript: one item snapshot per line; the last snapshot of an id wins. */
export class Transcript {
  constructor(readonly file: string) {
    mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  }

  append(item: ChatItem): void {
    appendFileSync(this.file, JSON.stringify(item) + '\n', { mode: 0o600 });
  }

  load(): ChatItem[] {
    if (!existsSync(this.file)) return [];
    const byId = new Map<string, ChatItem>();
    for (const line of readFileSync(this.file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const item = ChatItemSchema.parse(JSON.parse(line));
        byId.delete(item.id); // keep insertion order of the latest snapshot's first appearance
        byId.set(item.id, item);
      } catch {
        // skip a damaged line
      }
    }
    return [...byId.values()].sort((a, b) => a.at - b.at);
  }
}
