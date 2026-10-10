import { randomUUID } from 'node:crypto';
import type { DecisionAnswer, DecisionCard } from '@cherry/shared';
import { badRequest, conflict, notFound } from '../http.ts';

interface Waiting {
  card: DecisionCard;
  source: string;
  resolve(answer: { text: string; label: string } | null): void;
}

/** Decision cards waiting for the user, keyed by card id. */
export class DecisionBroker {
  private readonly waiting = new Map<string, Waiting>();

  newId(): string {
    return `dc_${randomUUID().slice(0, 10)}`;
  }

  wait(card: DecisionCard, source: string): Promise<{ text: string; label: string } | null> {
    return new Promise((resolve) => this.waiting.set(card.id, { card, source, resolve }));
  }

  answer(cardId: string, answer: DecisionAnswer): { text: string; label: string } {
    const w = this.waiting.get(cardId);
    if (!w) throw notFound(`No open decision ${cardId}`);
    let result: { text: string; label: string };
    if (answer.optionId) {
      const opt = w.card.options.find((o) => o.id === answer.optionId);
      if (!opt) throw badRequest(`No option ${answer.optionId}`);
      result = { text: `User chose: ${opt.title}`, label: opt.title };
    } else {
      if (!w.card.allowCustom) throw conflict('This decision has fixed options.');
      const custom = answer.custom?.trim() ?? '';
      result = { text: `User wrote their own answer: ${custom}`, label: custom };
    }
    this.waiting.delete(cardId);
    w.resolve(result);
    return result;
  }

  cancel(source: string): void {
    for (const [id, w] of [...this.waiting]) {
      if (w.source === source) {
        this.waiting.delete(id);
        w.resolve(null);
      }
    }
  }

  isOpen(cardId: string): boolean {
    return this.waiting.has(cardId);
  }
}
