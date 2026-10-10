import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AgentStartSchema } from '@cherry/shared';
import type { AgentManager } from '../agents/manager.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });
const AgentParams = z.object({ agentId: z.string().min(1).max(60) });

export function agentRoutes(agents: AgentManager) {
  return (app: FastifyInstance) => {
    app.get('/api/projects/:id/agents', async (req) => agents.list(IdParams.parse(req.params).id));
    app.post('/api/projects/:id/agents', async (req) =>
      agents.start(IdParams.parse(req.params).id, AgentStartSchema.parse(req.body)),
    );
    const id = (req: { params: unknown }) => AgentParams.parse(req.params).agentId;
    app.get('/api/agents/:agentId/diff', async (req) => agents.diff(id(req)));
    app.post('/api/agents/:agentId/accept', async (req) => agents.accept(id(req)));
    app.post('/api/agents/:agentId/discard', async (req) => agents.discard(id(req)));
    app.post('/api/agents/:agentId/retry', async (req) => agents.retry(id(req)));
    app.post('/api/agents/:agentId/stop', async (req) => agents.stop(id(req)));
  };
}
