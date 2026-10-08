import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createReadStream } from 'node:fs';
import {
  ApprovalAnswerSchema,
  ChatSendSchema,
  DecisionAnswerSchema,
  MAX_UPLOAD_BYTES,
} from '@apeiron/shared';
import { contentTypeFor } from '../chat/uploads.ts';
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

    // Attachments: the raw file is the body, the name is in the query (no multipart dependency).
    void app.register(async (scope) => {
      scope.addContentTypeParser(
        '*',
        { parseAs: 'buffer', bodyLimit: MAX_UPLOAD_BYTES + 1024 },
        (_req, body, done) => done(null, body),
      );
      scope.post('/api/projects/:id/uploads', async (req) => {
        const { name } = z.object({ name: z.string().min(1).max(300) }).parse(req.query);
        if (!Buffer.isBuffer(req.body)) throw new Error('Send the file as the request body.');
        return chat.upload(IdParams.parse(req.params).id, name, req.body);
      });
    });

    app.get('/api/projects/:id/uploads/:file', async (req, reply) => {
      const { id, file } = z
        .object({ id: z.string().min(1).max(200), file: z.string().min(1).max(300) })
        .parse(req.params);
      const abs = chat.uploadFile(id, file);
      const { type, inline } = contentTypeFor(file);
      return reply
        .header('content-type', type)
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "default-src 'none'; sandbox")
        .header('content-disposition', `${inline ? 'inline' : 'attachment'}; filename="${file}"`)
        .send(createReadStream(abs));
    });

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
