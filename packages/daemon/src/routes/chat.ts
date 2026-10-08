import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ApprovalAnswerSchema, ChatSendSchema, DecisionAnswerSchema } from '@apeiron/shared';
import type { ChatService } from '../chat/service.ts';
import type { ApprovalBroker } from '../claude/approvals.ts';
import type { DecisionBroker } from '../claude/decisions.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

export function chatRoutes(
  chat: ChatService,
  approvals: ApprovalBroker,
  decisions: DecisionBroker,
) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/chat', async (req) => chat.state(IdParams.parse(req.params).id));

    app.post('/api/projects/:id/chat', async (req) =>
      chat.send(IdParams.parse(req.params).id, ChatSendSchema.parse(req.body)),
    );

    app.post('/api/projects/:id/chat/stop', async (req) => {
      await chat.stop(IdParams.parse(req.params).id);
      return { ok: true };
    });

    app.post('/api/projects/:id/chat/new', async (req) => {
      await chat.newConversation(IdParams.parse(req.params).id);
      return { ok: true };
    });

    app.post('/api/decisions/:cardId', async (req) => {
      const { cardId } = z.object({ cardId: z.string().max(40) }).parse(req.params);
      return decisions.answer(cardId, DecisionAnswerSchema.parse(req.body));
    });

    app.get('/api/approvals', async (req) => {
      const { status } = z
        .object({
          status: z
            .enum(['pending', 'allowed', 'allowed_session', 'denied', 'cancelled'])
            .optional(),
        })
        .parse(req.query);
      return { approvals: approvals.list(status) };
    });

    app.post('/api/approvals/:id', async (req) => {
      const { id } = z.object({ id: z.string().max(40) }).parse(req.params);
      return approvals.answer(id, ApprovalAnswerSchema.parse(req.body));
    });
  };
}
