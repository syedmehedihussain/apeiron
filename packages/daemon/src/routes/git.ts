import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GitActions } from '../projects/git-actions.ts';

const IdParams = z.object({ id: z.string().min(1).max(200) });

export function gitRoutes(actions: GitActions) {
  return (app: FastifyInstance) => {
    app.post('/api/projects/:id/git/pull', async (req) =>
      actions.pull(IdParams.parse(req.params).id),
    );
    app.post('/api/projects/:id/git/push', async (req) =>
      actions.push(IdParams.parse(req.params).id),
    );
    app.get('/api/projects/:id/git/prs', async (req) => actions.prs(IdParams.parse(req.params).id));
  };
}
